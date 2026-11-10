import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { MarketplaceError } from './errors.ts';
import { assertSafeRelativePath, verifyPackageDir, type VerifiedPackage } from './integrity.ts';
import { maxRisk, type RiskLevel } from './permissions.ts';
import type { Manifest, PackageKind } from './manifest.ts';
import { compareSemver, parseSemver, satisfies } from './semver.ts';

const IndexSchema = z
  .object({
    registry: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
    entries: z.array(
      z
        .object({
          id: z.string(),
          version: z.string(),
          path: z.string(),
          digest: z.string().regex(/^[0-9a-f]{64}$/),
        })
        .strict(),
    ),
  })
  .strict();
type Index = z.infer<typeof IndexSchema>;

export type Environment = {
  nexusVersion: string;
  os: 'macos' | 'linux';
  arch: 'arm64' | 'x64';
  harness: string;
};

export type Compatibility = { compatible: boolean; reasons: string[] };

export function evaluateCompatibility(manifest: Manifest, env: Environment): Compatibility {
  const c = manifest.compatibility;
  const reasons: string[] = [];
  if (!satisfies(env.nexusVersion, c.nexus)) {
    reasons.push(`nexus ${env.nexusVersion} not in ${c.nexus}`);
  }
  if (!c.os.includes(env.os)) reasons.push(`os ${env.os} not supported`);
  if (!c.arch.includes(env.arch)) reasons.push(`arch ${env.arch} not supported`);
  if (!c.harness.includes('any') && !(c.harness as string[]).includes(env.harness)) {
    reasons.push(`harness ${env.harness} not supported`);
  }
  return { compatible: reasons.length === 0, reasons };
}

export type SecurityIndicators = {
  digestVerified: boolean;
  publisher: string;
  license: string;
  riskLevel: RiskLevel;
};

export type CatalogEntry = { manifest: Manifest; indicators: SecurityIndicators };

export type SearchQuery = {
  text?: string;
  kind?: PackageKind;
  category?: string;
  compatibleWith?: Environment;
};

export type SearchResult = CatalogEntry & { compatibility: Compatibility | null };

export function searchCatalog(entries: readonly CatalogEntry[], q: SearchQuery): SearchResult[] {
  const needle = q.text?.trim().toLowerCase();
  const out: SearchResult[] = [];
  for (const e of entries) {
    const m = e.manifest;
    if (q.kind && m.kind !== q.kind) continue;
    if (q.category && !m.categories.includes(q.category)) continue;
    if (
      needle &&
      !`${m.id} ${m.description} ${m.publisher} ${m.categories.join(' ')}`
        .toLowerCase()
        .includes(needle)
    ) {
      continue;
    }
    const compatibility = q.compatibleWith ? evaluateCompatibility(m, q.compatibleWith) : null;
    if (compatibility && !compatibility.compatible) continue;
    out.push({ ...e, compatibility });
  }
  return out.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

export class LocalRegistry {
  private constructor(
    readonly root: string,
    readonly id: string,
    private readonly index: Index,
  ) {}

  static async load(root: string): Promise<LocalRegistry> {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path.join(root, 'index.json'), 'utf8'));
    } catch {
      throw new MarketplaceError('invalid_manifest', 'registry index.json missing or invalid');
    }
    const parsed = IndexSchema.safeParse(raw);
    if (!parsed.success) throw new MarketplaceError('invalid_manifest', 'registry index invalid');
    for (const e of parsed.data.entries) assertSafeRelativePath(`${e.path}/x.json`);
    return new LocalRegistry(root, parsed.data.registry, parsed.data);
  }

  /** Verifies one package against the index; resolves the highest version when none is given. */
  async fetch(id: string, version?: string): Promise<VerifiedPackage> {
    const candidates = this.index.entries.filter(
      (e) => e.id === id && (!version || e.version === version),
    );
    candidates.sort((a, b) => compareSemver(parseSemver(b.version), parseSemver(a.version)));
    const entry = candidates[0];
    if (!entry) throw new MarketplaceError('package_not_found', `package not found: ${id}`);
    const dir = path.join(this.root, ...entry.path.split('/'));
    const st = await lstat(dir).catch(() => null);
    if (!st) throw new MarketplaceError('package_not_found', `package directory missing: ${id}`);
    if (st.isSymbolicLink())
      throw new MarketplaceError('symlink_rejected', `symlink rejected: ${entry.path}`);
    const verified = await verifyPackageDir(dir);
    const m = verified.manifest;
    if (m.digest !== entry.digest) {
      throw new MarketplaceError(
        'digest_mismatch',
        `index digest does not match manifest for ${id}`,
      );
    }
    if (m.id !== entry.id || m.version !== entry.version) {
      throw new MarketplaceError(
        'invalid_manifest',
        `index entry does not match manifest for ${id}`,
      );
    }
    if (m.source.registry !== this.id) {
      throw new MarketplaceError(
        'registry_mismatch',
        `manifest source ${m.source.registry} != ${this.id}`,
      );
    }
    return verified;
  }

  /** Verifies every entry. Entries that fail verification are listed in `rejected`, never served. */
  async catalog(): Promise<{ entries: CatalogEntry[]; rejected: { id: string; code: string }[] }> {
    const entries: CatalogEntry[] = [];
    const rejected: { id: string; code: string }[] = [];
    for (const e of this.index.entries) {
      try {
        const { manifest } = await this.fetch(e.id, e.version);
        entries.push({
          manifest,
          indicators: {
            digestVerified: true,
            publisher: manifest.publisher,
            license: manifest.license,
            riskLevel: maxRisk(manifest.permissions),
          },
        });
      } catch (err) {
        rejected.push({
          id: e.id,
          code: err instanceof MarketplaceError ? err.code : 'invalid_manifest',
        });
      }
    }
    return { entries, rejected };
  }
}
