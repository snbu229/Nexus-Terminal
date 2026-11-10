import { chmod, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MarketplaceError, parseManifest, verifyPackageDir } from '../src/index.ts';
import { draft, makeRegistry } from './helpers.ts';

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: unknown) => (e instanceof MarketplaceError ? e.code : `other:${String(e)}`),
  );

describe('integrity', () => {
  it('verifies a clean package', async () => {
    const { dir } = await makeRegistry();
    const v = await verifyPackageDir(dir);
    expect(v.manifest.id).toBe('test-skill');
    expect(v.files.get('SKILL.md')?.length).toBeGreaterThan(0);
  });

  it('rejects a tampered file (sha256 mismatch)', async () => {
    const { dir } = await makeRegistry({}, async (d) =>
      writeFile(path.join(d, 'SKILL.md'), 'evil'),
    );
    expect(await code(verifyPackageDir(dir))).toBe('file_hash_mismatch');
  });

  it('rejects a manifest digest mismatch', async () => {
    const { dir } = await makeRegistry({}, async (d, m) => {
      await writeFile(
        path.join(d, 'manifest.json'),
        JSON.stringify({ ...m, description: 'changed' }),
      );
    });
    expect(await code(verifyPackageDir(dir))).toBe('digest_mismatch');
  });

  it('rejects an index digest that does not match the manifest', async () => {
    const { registry, root } = await makeRegistry();
    await writeFile(
      path.join(root, 'index.json'),
      JSON.stringify({
        registry: 'local-dev',
        entries: [
          {
            id: 'test-skill',
            version: '1.0.0',
            path: 'packages/test-skill',
            digest: 'a'.repeat(64),
          },
        ],
      }),
    );
    const { LocalRegistry } = await import('../src/index.ts');
    const reloaded = await LocalRegistry.load(root);
    expect(registry.id).toBe('local-dev');
    expect(await code(reloaded.fetch('test-skill'))).toBe('digest_mismatch');
  });

  it.each([
    ['../escape.md', 'unsafe_path'],
    ['a/../../escape.md', 'unsafe_path'],
    ['/etc/passwd.md', 'unsafe_path'],
    ['C:/win.md', 'unsafe_path'],
    ['a\\b.md', 'unsafe_path'],
    ['./SKILL.md', 'unsafe_path'],
    ['manifest.json', 'unsafe_path'],
  ])('rejects path %s', async (p, expected) => {
    expect(await code(verifyPackageDir(await makeRegistryNamed(p)))).toBe(expected);
  });

  it('rejects a symlinked file', async () => {
    const { dir } = await makeRegistry({}, async (d) => {
      await writeFile(path.join(d, 'real.md'), 'x');
      const { rm } = await import('node:fs/promises');
      await rm(path.join(d, 'SKILL.md'));
      await symlink(path.join(d, 'real.md'), path.join(d, 'SKILL.md'));
    });
    expect(await code(verifyPackageDir(dir))).toBe('symlink_rejected');
  });

  it('rejects a symlink hidden in the tree even if undeclared', async () => {
    const { dir } = await makeRegistry({}, async (d) =>
      symlink('/etc/passwd', path.join(d, 'link.md')),
    );
    expect(await code(verifyPackageDir(dir))).toBe('symlink_rejected');
  });

  it('rejects an undeclared extra file', async () => {
    const { dir } = await makeRegistry({}, async (d) => writeFile(path.join(d, 'extra.md'), 'x'));
    expect(await code(verifyPackageDir(dir))).toBe('undeclared_file');
  });

  it('rejects an executable file type', async () => {
    const { dir } = await makeRegistry({ files: [{ path: 'run.sh' }] });
    expect(await code(verifyPackageDir(dir))).toBe('executable_payload');
  });

  it('rejects an executable bit and a shebang in an allowed extension', async () => {
    const a = await makeRegistry({}, async (d) => chmod(path.join(d, 'SKILL.md'), 0o755));
    expect(await code(verifyPackageDir(a.dir))).toBe('executable_payload');
    const b = await makeRegistry({}, async (d, m) => {
      await writeFile(path.join(d, 'SKILL.md'), '#!/bin/sh\necho hi\n');
      void m;
    });
    // content changed after sealing: caught as executable content before the hash check
    expect(await code(verifyPackageDir(b.dir))).toBe('executable_payload');
  });

  it.each(['scripts', 'postinstall', 'hooks', 'bin'])(
    'rejects forbidden manifest field %s',
    (field) => {
      const raw = {
        ...draft(),
        digest: 'a'.repeat(64),
        files: [{ path: 'a.md', sha256: 'a'.repeat(64) }],
        [field]: 'x',
      };
      expect(() => parseManifest(raw)).toThrowError(
        expect.objectContaining({ code: 'forbidden_field' }),
      );
    },
  );

  it('rejects unknown permissions and under-declared kind permissions', () => {
    const base = {
      ...draft(),
      digest: 'a'.repeat(64),
      files: [{ path: 'a.md', sha256: 'a'.repeat(64) }],
    };
    expect(() => parseManifest({ ...base, permissions: ['root.everything'] })).toThrowError(
      expect.objectContaining({ code: 'undeclared_permission' }),
    );
    expect(() => parseManifest({ ...base, kind: 'mcp-server', permissions: [] })).toThrowError(
      expect.objectContaining({ code: 'undeclared_permission' }),
    );
  });

  it('rejects a registry mismatch between index and manifest source', async () => {
    const { registry } = await makeRegistry({}, undefined, 'other-registry');
    expect(await code(registry.fetch('test-skill'))).toBe('registry_mismatch');
  });
});

async function makeRegistryNamed(p: string): Promise<string> {
  // Seal manually: compute the digest over a manifest that names `p` without needing the file.
  const { computeManifestDigest } = await import('../src/index.ts');
  const { mkdir } = await import('node:fs/promises');
  const { tmp } = await import('./helpers.ts');
  const dir = await tmp();
  await mkdir(dir, { recursive: true });
  const d = draft();
  const withFiles = { ...d, files: [{ path: p, sha256: 'a'.repeat(64) }] };
  const manifest = { ...withFiles, digest: computeManifestDigest(withFiles) };
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}
