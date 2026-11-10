import { mkdir, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEV_DEFAULT_POLICY,
  InstallManager,
  JsonFileInstallStore,
  LocalRegistry,
  MarketplaceError,
  evaluateCompatibility,
  evaluatePolicy,
  satisfies,
  searchCatalog,
  type OrgPolicy,
} from '../src/index.ts';
import { ENV, makeRegistry, tmp } from './helpers.ts';

const DEV_REGISTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../marketplace/dev-registry',
);

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: unknown) => (e instanceof MarketplaceError ? e.code : `other:${String(e)}`),
  );

const allowAll: OrgPolicy = {
  allowedRegistries: ['local-dev'],
  allowedPublishers: ['nexus-samples'],
  permissions: {
    'fs.read.workspace': 'allow',
    'net.egress': 'require_approval',
    'secrets.read': 'deny',
  },
};

async function manager(
  over: Partial<ConstructorParameters<typeof InstallManager>[0]> & { registry: LocalRegistry },
) {
  return new InstallManager({ policy: allowAll, env: ENV, sandboxRoot: await tmp(), ...over });
}

describe('semver', () => {
  it('handles caret, tilde, comparators and wildcard', () => {
    expect(satisfies('0.1.5', '^0.1.0')).toBe(true);
    expect(satisfies('0.2.0', '^0.1.0')).toBe(false);
    expect(satisfies('1.4.0', '^1.2.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
    expect(satisfies('1.2.9', '~1.2.0')).toBe(true);
    expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
    expect(satisfies('0.5.0', '>=0.0.0 <1.0.0')).toBe(true);
    expect(satisfies('1.0.0', '>=0.0.0 <1.0.0')).toBe(false);
    expect(satisfies('9.9.9', '*')).toBe(true);
  });
});

describe('dev registry', () => {
  it('serves six verified declarative sample packages', async () => {
    const reg = await LocalRegistry.load(DEV_REGISTRY);
    const { entries, rejected } = await reg.catalog();
    expect(rejected).toEqual([]);
    expect(entries.map((e) => e.manifest.kind).sort()).toEqual([
      'agent-template',
      'harness-adapter',
      'mcp-server',
      'skill',
      'skill',
      'terminal-extension',
    ]);
    expect(entries.every((e) => e.indicators.digestVerified)).toBe(true);
  });

  it('contains no executables, scripts or symlinks on disk', async () => {
    const walk = async (d: string): Promise<string[]> => {
      const out: string[] = [];
      for (const e of await readdir(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) out.push(...(await walk(p)));
        else {
          expect(e.isFile()).toBe(true);
          expect((await stat(p)).mode & 0o111).toBe(0);
          expect(['.md', '.json']).toContain(path.extname(p));
          expect((await readFile(p, 'utf8')).startsWith('#!')).toBe(false);
          out.push(p);
        }
      }
      return out;
    };
    expect((await walk(DEV_REGISTRY)).length).toBeGreaterThan(6);
  });
});

describe('search, compatibility and indicators', () => {
  it('searches by text, kind and category with risk indicators', async () => {
    const { entries } = await (await LocalRegistry.load(DEV_REGISTRY)).catalog();
    expect(searchCatalog(entries, { text: 'commit' }).map((e) => e.manifest.id)).toEqual([
      'commit-message-skill',
    ]);
    expect(searchCatalog(entries, { kind: 'skill' })).toHaveLength(2);
    expect(searchCatalog(entries, { category: 'mock' })).toHaveLength(3);
    const mcp = searchCatalog(entries, { kind: 'mcp-server' })[0];
    expect(mcp?.indicators).toEqual({
      digestVerified: true,
      publisher: 'nexus-samples',
      license: 'Apache-2.0',
      riskLevel: 'high',
    });
  });

  it('filters by compatibility with the environment', async () => {
    const { entries } = await (await LocalRegistry.load(DEV_REGISTRY)).catalog();
    const mock = searchCatalog(entries, { compatibleWith: ENV });
    const other = searchCatalog(entries, { compatibleWith: { ...ENV, harness: 'codex' } });
    expect(mock).toHaveLength(6);
    expect(other.map((e) => e.manifest.id)).not.toContain('mock-reviewer-agent');
  });

  it('reports incompatible nexus, os, arch and harness with reasons', async () => {
    const { manifest } = await makeRegistry({
      compatibility: { nexus: '^0.1.0', os: ['macos'], arch: ['arm64'], harness: ['claude-code'] },
    });
    const c = evaluateCompatibility(manifest, {
      nexusVersion: '1.0.0',
      os: 'linux',
      arch: 'x64',
      harness: 'mock',
    });
    expect(c.compatible).toBe(false);
    expect(c.reasons).toHaveLength(4);
  });
});

describe('organisation policy', () => {
  it('allows, requires approval, and denies with reasons', async () => {
    const { manifest } = await makeRegistry({ permissions: ['fs.read.workspace'] });
    expect(evaluatePolicy(allowAll, manifest).decision).toBe('allow');
    const m2 = await makeRegistry({ kind: 'mcp-server', permissions: ['net.egress'] });
    expect(evaluatePolicy(allowAll, m2.manifest).decision).toBe('require_approval');
    const m3 = await makeRegistry({ permissions: ['secrets.read'] });
    const d = evaluatePolicy(allowAll, m3.manifest);
    expect(d.decision).toBe('deny');
    expect(d.reasons[0]?.code).toBe('permission_denied');
  });

  it('denies an unknown registry, an unlisted publisher and an unmapped permission', async () => {
    const { manifest } = await makeRegistry({ permissions: ['ui.theme'] });
    expect(
      evaluatePolicy({ ...allowAll, allowedRegistries: ['other'] }, manifest).reasons.map(
        (r) => r.code,
      ),
    ).toContain('registry_not_allowed');
    expect(evaluatePolicy({ ...allowAll, allowedPublishers: [] }, manifest).decision).toBe('deny');
    expect(evaluatePolicy(allowAll, manifest).reasons[0]?.code).toBe('permission_denied'); // ui.theme unmapped
  });

  it('rejects a malformed policy', async () => {
    const { manifest } = await makeRegistry();
    expect(() => evaluatePolicy({ ...allowAll, extra: 1 }, manifest)).toThrow();
  });
});

describe('install state machine', () => {
  it('installs an allowed package: copies declarative files into the sandbox and runs nothing', async () => {
    const { registry } = await makeRegistry();
    const m = await manager({ registry });
    const rec = await m.requestInstall({ packageId: 'test-skill', requester: 'alice' });
    expect(rec.state).toBe('installed');
    expect(rec.history.map((h) => h.state)).toEqual(['install_requested', 'installed']);
    expect(await readFile(path.join(rec.sandboxPath ?? '', 'SKILL.md'), 'utf8')).toContain(
      'SKILL.md',
    );
    expect((await stat(path.join(rec.sandboxPath ?? '', 'SKILL.md'))).mode & 0o111).toBe(0);
  });

  it('require_approval leads to pending_approval and copies nothing', async () => {
    const { registry } = await makeRegistry({ kind: 'mcp-server', permissions: ['net.egress'] });
    const m = await manager({ registry });
    const rec = await m.requestInstall({ packageId: 'test-skill', requester: 'alice' });
    expect(rec.state).toBe('pending_approval');
    expect(rec.sandboxPath).toBeNull();
    expect(JSON.stringify(rec)).not.toMatch(/approved/i);
  });

  it('rejects self-approval and offers no approval path for anyone else', async () => {
    const { registry } = await makeRegistry({ kind: 'mcp-server', permissions: ['net.egress'] });
    const m = await manager({ registry });
    await m.requestInstall({ packageId: 'test-skill', requester: 'Alice' });
    expect(await code(m.attemptApproval({ packageId: 'test-skill', approver: 'alice' }))).toBe(
      'self_approval',
    );
    expect(await code(m.attemptApproval({ packageId: 'test-skill', approver: 'bob' }))).toBe(
      'approval_unavailable',
    );
    expect((await m.get('test-skill'))?.state).toBe('pending_approval');
  });

  it('rejects approved:true anywhere in input', async () => {
    const { registry } = await makeRegistry({ kind: 'mcp-server', permissions: ['net.egress'] });
    const m = await manager({ registry });
    expect(
      await code(m.requestInstall({ packageId: 'test-skill', requester: 'a', approved: true })),
    ).toBe('approved_flag_rejected');
    expect(
      await code(
        m.requestInstall({ packageId: 'test-skill', requester: 'a', meta: { Approved: true } }),
      ),
    ).toBe('approved_flag_rejected');
    await m.requestInstall({ packageId: 'test-skill', requester: 'a' });
    expect(
      await code(m.attemptApproval({ packageId: 'test-skill', approver: 'b', approved: true })),
    ).toBe('approved_flag_rejected');
    expect(await m.list()).toHaveLength(1);
  });

  it('rejects unknown input fields', async () => {
    const { registry } = await makeRegistry();
    const m = await manager({ registry });
    expect(
      await code(m.requestInstall({ packageId: 'test-skill', requester: 'a', force: true })),
    ).toBe('invalid_request');
  });

  it('denies a deny permission and records nothing', async () => {
    const { registry } = await makeRegistry({ permissions: ['secrets.read'] });
    const m = await manager({ registry });
    expect(await code(m.requestInstall({ packageId: 'test-skill', requester: 'a' }))).toBe(
      'policy_denied',
    );
    expect(await m.list()).toEqual([]);
  });

  it('denies an unknown registry', async () => {
    const { registry } = await makeRegistry();
    const m = await manager({
      registry,
      policy: { ...allowAll, allowedRegistries: ['some-other'] },
    });
    expect(await code(m.requestInstall({ packageId: 'test-skill', requester: 'a' }))).toBe(
      'policy_denied',
    );
  });

  it('rejects incompatible os, arch and harness', async () => {
    const { registry } = await makeRegistry({
      compatibility: { nexus: '^0.1.0', os: ['macos'], arch: ['arm64'], harness: ['claude-code'] },
    });
    const m = await manager({ registry });
    const err = await m
      .requestInstall({ packageId: 'test-skill', requester: 'a' })
      .catch((e: MarketplaceError) => e);
    expect((err as MarketplaceError).code).toBe('incompatible');
    expect((err as MarketplaceError).message).toMatch(/os linux.*arch x64.*harness mock/);
  });

  it('rejects a tampered package at install time and leaves no record or files', async () => {
    const { registry } = await makeRegistry({}, async (d) =>
      writeFile(path.join(d, 'SKILL.md'), 'tampered'),
    );
    const m = await manager({ registry });
    expect(await code(m.requestInstall({ packageId: 'test-skill', requester: 'a' }))).toBe(
      'file_hash_mismatch',
    );
    expect(await m.list()).toEqual([]);
  });

  it('rejects an unknown package and a duplicate request', async () => {
    const { registry } = await makeRegistry();
    const m = await manager({ registry });
    expect(await code(m.requestInstall({ packageId: 'nope', requester: 'a' }))).toBe(
      'package_not_found',
    );
    await m.requestInstall({ packageId: 'test-skill', requester: 'a' });
    expect(await code(m.requestInstall({ packageId: 'test-skill', requester: 'a' }))).toBe(
      'invalid_transition',
    );
  });

  it('B1/B2: a conflicting sandbox target fails cleanly, keeps foreign data, leaves no record', async () => {
    const { registry } = await makeRegistry();
    const root = await tmp();
    const m = await manager({ registry, sandboxRoot: root });
    const dir = path.join(root, 'test-skill', '1.0.0');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'keep.txt'), 'mine');
    expect(await code(m.requestInstall({ packageId: 'test-skill', requester: 'a' }))).toBe(
      'sandbox_conflict',
    );
    expect(await readFile(path.join(dir, 'keep.txt'), 'utf8')).toBe('mine');
    expect(await m.list()).toEqual([]);
    expect((await readdir(root)).filter((n) => n.startsWith('.staging-'))).toEqual([]);
  });

  it('B2: a second manager sharing the sandbox cannot delete the first manager’s files', async () => {
    const { registry } = await makeRegistry();
    const root = await tmp();
    const a = await manager({ registry, sandboxRoot: root });
    const rec = await a.requestInstall({ packageId: 'test-skill', requester: 'a' });
    const b = await manager({ registry, sandboxRoot: root });
    expect(await code(b.requestInstall({ packageId: 'test-skill', requester: 'b' }))).toBe(
      'sandbox_conflict',
    );
    expect(await readFile(path.join(rec.sandboxPath ?? '', 'SKILL.md'), 'utf8')).toContain('SKILL');
  });

  it('B3: a symlink under the sandbox root cannot redirect writes outside it', async () => {
    const { registry } = await makeRegistry();
    const root = await tmp();
    const outside = await tmp();
    await symlink(outside, path.join(root, 'test-skill'));
    const m = await manager({ registry, sandboxRoot: root });
    expect(await code(m.requestInstall({ packageId: 'test-skill', requester: 'a' }))).toBe(
      'unsafe_path',
    );
    expect(await readdir(outside)).toEqual([]);
    expect(await m.list()).toEqual([]);
  });

  it('S2: invalid JSON in the state file raises invalid_state_file', async () => {
    const file = path.join(await tmp(), 'state.json');
    await writeFile(file, '{not json');
    expect(await code(new JsonFileInstallStore(file).all())).toBe('invalid_state_file');
  });

  it('S1: file paths differing only in case or Unicode form are rejected', async () => {
    for (const files of [
      [{ path: 'a.md' }, { path: 'A.md' }],
      [{ path: 'caf\u00e9.md' }, { path: 'cafe\u0301.md' }],
    ]) {
      const { registry } = await makeRegistry({ files });
      expect(await code(registry.fetch('test-skill'))).toBe('invalid_manifest');
    }
  });

  it('removes an installed package, deletes the sandbox copy, and allows reinstall', async () => {
    const { registry } = await makeRegistry();
    const m = await manager({ registry });
    const rec = await m.requestInstall({ packageId: 'test-skill', requester: 'a' });
    const removed = await m.requestRemove({ packageId: 'test-skill', requester: 'a' });
    expect(removed.history.map((h) => h.state)).toEqual([
      'install_requested',
      'installed',
      'remove_requested',
      'removed',
    ]);
    expect(await stat(rec.sandboxPath ?? '').catch(() => null)).toBeNull();
    expect((await m.requestInstall({ packageId: 'test-skill', requester: 'a' })).state).toBe(
      'installed',
    );
  });

  it('rejects removing a package that is not installed or is pending approval', async () => {
    const { registry } = await makeRegistry({ kind: 'mcp-server', permissions: ['net.egress'] });
    const m = await manager({ registry });
    expect(await code(m.requestRemove({ packageId: 'test-skill', requester: 'a' }))).toBe(
      'not_installed',
    );
    await m.requestInstall({ packageId: 'test-skill', requester: 'a' });
    expect(await code(m.requestRemove({ packageId: 'test-skill', requester: 'a' }))).toBe(
      'not_installed',
    );
  });

  it('persists to a JSON file store and refuses a file carrying approved flags', async () => {
    const { registry } = await makeRegistry();
    const file = path.join(await tmp(), 'state', 'installs.json');
    const m = await manager({ registry, store: new JsonFileInstallStore(file) });
    await m.requestInstall({ packageId: 'test-skill', requester: 'a' });
    const reopened = await manager({ registry, store: new JsonFileInstallStore(file) });
    expect((await reopened.get('test-skill'))?.state).toBe('installed');
    const rows = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>[];
    await writeFile(file, JSON.stringify(rows.map((r) => ({ ...r, approved: true }))));
    expect(await code(reopened.list())).toBe('invalid_state_file');
  });

  it('installs real dev-registry packages under the dev default policy; gates mcp/harness', async () => {
    const registry = await LocalRegistry.load(DEV_REGISTRY);
    const m = await manager({ registry, policy: DEV_DEFAULT_POLICY });
    expect(
      (await m.requestInstall({ packageId: 'shell-safety-skill', requester: 'a' })).state,
    ).toBe('installed');
    expect(
      (await m.requestInstall({ packageId: 'solarized-night-theme', requester: 'a' })).state,
    ).toBe('installed');
    expect((await m.requestInstall({ packageId: 'mock-docs-mcp', requester: 'a' })).state).toBe(
      'pending_approval',
    );
    expect(
      (await m.requestInstall({ packageId: 'mock-harness-adapter', requester: 'a' })).state,
    ).toBe('pending_approval');
  });
});
