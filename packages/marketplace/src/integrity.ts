import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { MarketplaceError } from './errors.ts';
import {
  ALLOWED_FILE_EXTENSIONS,
  computeManifestDigest,
  parseManifest,
  sha256Of,
  type Manifest,
} from './manifest.ts';

export const MANIFEST_FILE = 'manifest.json';

/** Validates a manifest-relative path lexically. Throws unsafe_path / executable_payload. */
export function assertSafeRelativePath(p: string): void {
  if (
    p.includes('\0') ||
    p.includes('\\') ||
    p.startsWith('/') ||
    /^[A-Za-z]:/.test(p) ||
    path.posix.isAbsolute(p)
  ) {
    throw new MarketplaceError(
      'unsafe_path',
      `absolute or malformed path rejected: ${JSON.stringify(p)}`,
    );
  }
  const segments = p.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new MarketplaceError('unsafe_path', `path traversal rejected: ${JSON.stringify(p)}`);
  }
  if (p === MANIFEST_FILE) {
    throw new MarketplaceError('unsafe_path', 'manifest.json must not list itself');
  }
  const ext = path.posix.extname(p).toLowerCase();
  if (!(ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new MarketplaceError('executable_payload', `file type not allowed: ${p}`);
  }
}

export type VerifiedPackage = {
  manifest: Manifest;
  /** Verified bytes, keyed by manifest path. Copy from these, never re-read from disk. */
  files: Map<string, Buffer>;
};

async function listTree(root: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path.join(root, rel))) {
    const relPath = rel ? `${rel}/${entry}` : entry;
    const st = await lstat(path.join(root, relPath));
    if (st.isSymbolicLink())
      throw new MarketplaceError('symlink_rejected', `symlink rejected: ${relPath}`);
    if (st.isDirectory()) out.push(...(await listTree(root, relPath)));
    else if (st.isFile()) out.push(relPath);
    else throw new MarketplaceError('unsafe_path', `non-regular file rejected: ${relPath}`);
  }
  return out;
}

/**
 * Verifies a package directory: schema, manifest digest, safe paths, no symlinks,
 * no undeclared files, no executable bits, per-file sha256. Executes nothing.
 */
export async function verifyPackageDir(dir: string): Promise<VerifiedPackage> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(dir, MANIFEST_FILE), 'utf8'));
  } catch {
    throw new MarketplaceError('invalid_manifest', 'manifest.json missing or not valid JSON');
  }
  const manifest = parseManifest(raw);

  if (computeManifestDigest(manifest) !== manifest.digest) {
    throw new MarketplaceError('digest_mismatch', `manifest digest mismatch for ${manifest.id}`);
  }
  for (const f of manifest.files) assertSafeRelativePath(f.path);

  const onDisk = new Set(await listTree(dir));
  onDisk.delete(MANIFEST_FILE);
  const declared = new Set(manifest.files.map((f) => f.path));
  for (const p of onDisk) {
    if (!declared.has(p)) throw new MarketplaceError('undeclared_file', `undeclared file: ${p}`);
  }

  const files = new Map<string, Buffer>();
  for (const f of manifest.files) {
    const abs = path.join(dir, ...f.path.split('/'));
    let st;
    try {
      st = await lstat(abs);
    } catch {
      throw new MarketplaceError('missing_file', `missing file: ${f.path}`);
    }
    if (st.isSymbolicLink())
      throw new MarketplaceError('symlink_rejected', `symlink rejected: ${f.path}`);
    if (!st.isFile()) throw new MarketplaceError('unsafe_path', `not a regular file: ${f.path}`);
    if ((st.mode & 0o111) !== 0) {
      throw new MarketplaceError('executable_payload', `executable bit set: ${f.path}`);
    }
    const data = await readFile(abs);
    if (
      data.subarray(0, 2).toString('latin1') === '#!' ||
      data.subarray(0, 4).toString('latin1') === '\x7fELF'
    ) {
      throw new MarketplaceError('executable_payload', `executable content: ${f.path}`);
    }
    if (sha256Of(data) !== f.sha256) {
      throw new MarketplaceError('file_hash_mismatch', `sha256 mismatch: ${f.path}`);
    }
    files.set(f.path, data);
  }
  return { manifest, files };
}
