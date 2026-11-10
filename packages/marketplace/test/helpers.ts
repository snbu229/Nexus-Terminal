import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  LocalRegistry,
  sealPackageDir,
  type DraftManifest,
  type Environment,
  type Manifest,
} from '../src/index.ts';

export const ENV: Environment = {
  nexusVersion: '0.1.0',
  os: 'linux',
  arch: 'x64',
  harness: 'mock',
};

export const tmp = () => mkdtemp(path.join(tmpdir(), 'nexus-mk-'));

export function draft(over: Partial<DraftManifest> = {}): DraftManifest {
  return {
    id: 'test-skill',
    kind: 'skill',
    version: '1.0.0',
    publisher: 'nexus-samples',
    license: 'Apache-2.0',
    description: 'Test skill',
    categories: ['test'],
    compatibility: {
      nexus: '^0.1.0',
      os: ['linux', 'macos'],
      arch: ['x64', 'arm64'],
      harness: ['any'],
    },
    files: [{ path: 'SKILL.md' }],
    permissions: ['fs.read.workspace'],
    source: { registry: 'local-dev', ref: 'test' },
    ...over,
  };
}

/** Builds a one-package registry in a temp dir. `mutate` runs after sealing (to tamper). */
export async function makeRegistry(
  over: Partial<DraftManifest> = {},
  mutate?: (pkgDir: string, manifest: Manifest) => Promise<void>,
  registryId = 'local-dev',
) {
  const root = await tmp();
  const d = draft(over);
  const dir = path.join(root, 'packages', d.id);
  await mkdir(dir, { recursive: true });
  for (const f of d.files) {
    const abs = path.join(dir, ...f.path.split('/'));
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, `# ${f.path}\n`);
  }
  const manifest = await sealPackageDir(dir, d);
  await mutate?.(dir, manifest);
  await writeFile(
    path.join(root, 'index.json'),
    JSON.stringify({
      registry: registryId,
      entries: [
        { id: d.id, version: d.version, path: `packages/${d.id}`, digest: manifest.digest },
      ],
    }),
  );
  return { root, dir, manifest, registry: await LocalRegistry.load(root) };
}

export { chmod };
