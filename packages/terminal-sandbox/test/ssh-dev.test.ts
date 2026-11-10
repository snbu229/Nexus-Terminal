import { afterEach, describe, expect, it } from 'vitest';
import {
  createSshDevProvider,
  startSshTestServer,
  type SshTestServer,
  type TerminalProvider,
} from '../src/index.js';
import { collect } from './helpers.js';

let server: SshTestServer | undefined;
let p: TerminalProvider | undefined;
afterEach(async () => {
  await p?.close();
  p = undefined;
  await server?.close();
  server = undefined;
});

describe('ssh-dev', () => {
  it('connects to the in-process server with the pinned key and runs the sandbox shell', async () => {
    server = await startSshTestServer();
    const prov = createSshDevProvider({
      host: '127.0.0.1',
      port: server.port,
      pinnedHostKeySha256: server.hostKeySha256,
      clientKey: server.clientPrivateKey,
    });
    p = await prov.open({ cols: 90, rows: 25 });
    const out = collect(p);
    await out.waitFor('\u001b]133;A');
    p.write('echo ssh-$((6*7))\n');
    await out.waitFor('ssh-42');
    p.write('stty size\n');
    await out.waitFor('25 90');
    p.resize(100, 33);
    p.write('stty size\n');
    await out.waitFor('33 100');
    p.write('exit 5\n');
    expect(await out.waitExit()).toBe(5);
  });

  it('does not leak the host environment through ssh either', async () => {
    process.env.GH_TOKEN = 'sekret-ssh-gh';
    try {
      server = await startSshTestServer();
      p = await createSshDevProvider({
        host: '127.0.0.1',
        port: server.port,
        pinnedHostKeySha256: server.hostKeySha256,
        clientKey: server.clientPrivateKey,
      }).open({ cols: 80, rows: 24 });
      const out = collect(p);
      await out.waitFor('\u001b]133;A');
      p.write('env; echo END-$((1+1))\n');
      await out.waitFor('END-2');
      expect(out.text).not.toContain('sekret-ssh-gh');
      expect(out.text).not.toContain('GH_TOKEN');
    } finally {
      delete process.env.GH_TOKEN;
    }
  });

  it('refuses a changed (unpinned) host key', async () => {
    server = await startSshTestServer();
    const other = await startSshTestServer(); // different ephemeral host key
    try {
      await expect(
        createSshDevProvider({
          host: '127.0.0.1',
          port: server.port,
          pinnedHostKeySha256: other.hostKeySha256,
          clientKey: server.clientPrivateKey,
        }).open({ cols: 80, rows: 24 }),
      ).rejects.toThrow(/host key/i);
    } finally {
      await other.close();
    }
  });

  it('refuses when no key is pinned', async () => {
    server = await startSshTestServer();
    await expect(
      createSshDevProvider({
        host: '127.0.0.1',
        port: server.port,
        pinnedHostKeySha256: '',
        clientKey: server.clientPrivateKey,
      }).open({ cols: 80, rows: 24 }),
    ).rejects.toThrow(/host key/i);
  });

  it('rejects a client that does not hold the ephemeral client key', async () => {
    server = await startSshTestServer();
    const other = await startSshTestServer();
    try {
      await expect(
        createSshDevProvider({
          host: '127.0.0.1',
          port: server.port,
          pinnedHostKeySha256: server.hostKeySha256,
          clientKey: other.clientPrivateKey,
        }).open({ cols: 80, rows: 24 }),
      ).rejects.toThrow();
    } finally {
      await other.close();
    }
  });
});
