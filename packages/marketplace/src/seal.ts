// Dev tooling: fills in file hashes and the manifest digest for a package directory.
// Used by tools/seal-dev-registry.ts and by tests; not part of any install path.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_FILE } from './integrity.ts';
import { computeManifestDigest, sha256Of, type Manifest, type ManifestDraft } from './manifest.ts';

export type DraftManifest = Omit<ManifestDraft, 'files'> & { files: { path: string }[] };

export async function sealPackageDir(dir: string, draft: DraftManifest): Promise<Manifest> {
  const files = [];
  for (const f of draft.files) {
    files.push({
      path: f.path,
      sha256: sha256Of(await readFile(path.join(dir, ...f.path.split('/')))),
    });
  }
  const withFiles: ManifestDraft = { ...draft, files };
  const manifest: Manifest = { ...withFiles, digest: computeManifestDigest(withFiles) };
  await writeFile(path.join(dir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
