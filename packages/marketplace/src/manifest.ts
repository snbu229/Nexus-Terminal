import { createHash } from 'node:crypto';
import { z } from 'zod';
import { MarketplaceError } from './errors.ts';
import { PermissionSchema, type Permission } from './permissions.ts';
import { isSemver, isValidRange } from './semver.ts';

export const PACKAGE_KINDS = [
  'agent-template',
  'skill',
  'mcp-server',
  'harness-adapter',
  'terminal-extension',
] as const;
export const PackageKindSchema = z.enum(PACKAGE_KINDS);
export type PackageKind = z.infer<typeof PackageKindSchema>;

export const OS_VALUES = ['macos', 'linux'] as const;
export const ARCH_VALUES = ['arm64', 'x64'] as const;
export const HARNESS_VALUES = [
  'any',
  'mock',
  'claude-code',
  'codex',
  'opencode',
  'hermes',
] as const;

// Packages are declarative data only; anything that could execute is rejected by extension.
export const ALLOWED_FILE_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.toml'] as const;

// Fields that imply code execution or lifecycle hooks. Rejected outright with a clear error.
export const FORBIDDEN_MANIFEST_KEYS = [
  'scripts',
  'postinstall',
  'preinstall',
  'install',
  'hooks',
  'lifecycle',
  'bin',
  'main',
  'command',
  'exec',
  'entrypoint',
] as const;

// Permissions a kind necessarily implies; a manifest that omits them is under-declaring.
export const KIND_IMPLIED_PERMISSIONS: Record<PackageKind, readonly Permission[]> = {
  'agent-template': ['agent.session.start'],
  skill: [],
  'mcp-server': ['net.egress'],
  'harness-adapter': ['process.spawn'],
  'terminal-extension': [],
};

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, 'must be lowercase sha256 hex');
const slug = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);

export const ManifestFileSchema = z
  .object({ path: z.string().min(1).max(256), sha256: sha256Hex })
  .strict();

export const ManifestSchema = z
  .object({
    id: slug,
    kind: PackageKindSchema,
    version: z.string().refine(isSemver, 'must be semver'),
    publisher: slug,
    license: z
      .string()
      .regex(
        /^[A-Za-z0-9.+-]+(?: (?:AND|OR|WITH) [A-Za-z0-9.+-]+)*$/,
        'must be an SPDX expression',
      ),
    description: z.string().min(1).max(500),
    categories: z.array(slug).min(1).max(8),
    compatibility: z
      .object({
        nexus: z.string().refine(isValidRange, 'must be a semver range'),
        os: z.array(z.enum(OS_VALUES)).min(1),
        arch: z.array(z.enum(ARCH_VALUES)).min(1),
        harness: z.array(z.enum(HARNESS_VALUES)).min(1),
      })
      .strict(),
    files: z.array(ManifestFileSchema).min(1).max(64),
    digest: sha256Hex,
    permissions: z.array(PermissionSchema).max(16),
    source: z.object({ registry: slug, ref: z.string().regex(/^[A-Za-z0-9._/-]{1,64}$/) }).strict(),
  })
  .strict()
  .superRefine((m, ctx) => {
    const paths = new Set<string>();
    for (const f of m.files) {
      if (paths.has(f.path)) ctx.addIssue({ code: 'custom', message: `duplicate file ${f.path}` });
      paths.add(f.path);
    }
    if (new Set(m.permissions).size !== m.permissions.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate permission' });
    }
  });

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestDraft = Omit<Manifest, 'digest'>;

export function parseManifest(input: unknown): Manifest {
  if (typeof input === 'object' && input !== null) {
    for (const key of FORBIDDEN_MANIFEST_KEYS) {
      if (Object.hasOwn(input, key)) {
        throw new MarketplaceError('forbidden_field', `manifest field "${key}" is not allowed`);
      }
    }
  }
  const result = ManifestSchema.safeParse(input);
  if (!result.success) {
    const perm = result.error.issues.find((i) => i.path[0] === 'permissions');
    if (perm) {
      throw new MarketplaceError('undeclared_permission', `invalid permission: ${perm.message}`);
    }
    throw new MarketplaceError(
      'invalid_manifest',
      result.error.issues.map((i) => i.message).join('; '),
    );
  }
  const m = result.data;
  const missing = KIND_IMPLIED_PERMISSIONS[m.kind].filter((p) => !m.permissions.includes(p));
  if (missing.length > 0) {
    throw new MarketplaceError(
      'undeclared_permission',
      `kind ${m.kind} implies undeclared permissions: ${missing.join(', ')}`,
    );
  }
  return m;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort())
      out[k] = canonicalize((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

/** Canonical JSON of the manifest minus `digest`: sorted keys; files, permissions, categories sorted. */
export function canonicalManifestJson(manifest: ManifestDraft | Manifest): string {
  const rest: Omit<Manifest, 'digest'> & { digest?: string } = { ...(manifest as Manifest) };
  delete rest.digest;
  const normalised = {
    ...rest,
    files: [...rest.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    permissions: [...rest.permissions].sort(),
    categories: [...rest.categories].sort(),
    compatibility: {
      ...rest.compatibility,
      os: [...rest.compatibility.os].sort(),
      arch: [...rest.compatibility.arch].sort(),
      harness: [...rest.compatibility.harness].sort(),
    },
  };
  return JSON.stringify(canonicalize(normalised));
}

export function computeManifestDigest(manifest: ManifestDraft | Manifest): string {
  return createHash('sha256').update(canonicalManifestJson(manifest)).digest('hex');
}

export function sha256Of(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}
