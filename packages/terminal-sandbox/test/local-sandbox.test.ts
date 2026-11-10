import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { createLocalSandbox, scrubbedEnv, type TerminalProvider } from '../src/index.js';
import { collect } from './helpers.js';

const SECRETS = {
  PAPERCLIP_API_KEY: 'sekret-paperclip-0001',
  GH_TOKEN: 'sekret-gh-0002',
  GITHUB_TOKEN: 'sekret-github-0003',
  AWS_SECRET_ACCESS_KEY: 'sekret-aws-0004',
  SSH_AUTH_SOCK: '/tmp/sekret-agent-0005',
};
const saved: Record<string, string | undefined> = {};
let p: TerminalProvider | undefined;

beforeEach(() => {
  for (const [k, v] of Object.entries(SECRETS)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
afterEach(async () => {
  await p?.close();
  p = undefined;
  for (const k of Object.keys(SECRETS)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('scrubbedEnv', () => {
  it('keeps only the allowlist', () => {
    const env = scrubbedEnv({ ...process.env, ...SECRETS, FOO: 'x' }, '/tmp/h');
    expect(Object.keys(env).sort()).toEqual(['HOME', 'LANG', 'PATH', 'SHELL', 'TERM']);
    expect(env.HOME).toBe('/tmp/h');
  });
});

describe('local-sandbox', () => {
  it('opens, echoes, resizes and exits with the shell exit code', async () => {
    p = await createLocalSandbox().open({ cols: 100, rows: 30 });
    const out = collect(p);
    await out.waitFor('\u001b]133;A'); // first prompt (OSC 133 A)
    p.write('echo hello-$((20+22))\n');
    await out.waitFor('hello-42');
    p.write('stty size\n');
    await out.waitFor('30 100');
    p.resize(120, 40);
    p.write('stty size\n');
    await out.waitFor('40 120');
    p.write('exit 3\n');
    expect(await out.waitExit()).toBe(3);
  });

  it('emits OSC 133 A/B/C/D around a command', async () => {
    p = await createLocalSandbox().open({ cols: 80, rows: 24 });
    const out = collect(p);
    await out.waitFor('\u001b]133;A');
    p.write('false\n');
    await out.waitFor('\u001b]133;D;1');
    expect(out.text).toContain('\u001b]133;B');
    expect(out.text).toContain('\u001b]133;C');
  });

  it('does not leak the host environment into the shell (env scrub)', async () => {
    p = await createLocalSandbox().open({ cols: 80, rows: 24 });
    const out = collect(p);
    await out.waitFor('\u001b]133;A');
    p.write('env; echo END-$((1+1))\n');
    await out.waitFor('END-2');
    for (const [k, v] of Object.entries(SECRETS)) {
      expect(out.text).not.toContain(k);
      expect(out.text).not.toContain(v);
    }
    expect(out.text).not.toMatch(/PAPERCLIP_/);
    expect(out.text).toMatch(/^HOME=\/.*nexus-sandbox-/m);
  });

  it('uses a temp HOME and cwd that are removed on close', async () => {
    const sb = createLocalSandbox();
    p = await sb.open({ cols: 80, rows: 24 });
    const out = collect(p);
    await out.waitFor('\u001b]133;A');
    p.write('echo "<<$(pwd)>>" "[[$HOME]]"\n');
    await out.waitFor(/<<\/[^>]+>> \[\[\/[^\]]+\]\]/);
    const m = /<<(\/[^>]+)>> \[\[(\/[^\]]+)\]\]/.exec(out.text);
    const dir = m?.[1] ?? '';
    expect(m?.[2]).toBe(dir);
    expect(dir).toContain('nexus-sandbox-');
    expect(existsSync(dir)).toBe(true);
    await p.close();
    expect(existsSync(dir)).toBe(false);
    p = undefined;
  });

  it('runs two sandboxes in parallel without crosstalk', async () => {
    const a = await createLocalSandbox().open({ cols: 80, rows: 24 });
    const b = await createLocalSandbox().open({ cols: 80, rows: 24 });
    try {
      const oa = collect(a);
      const ob = collect(b);
      await Promise.all([oa.waitFor('\u001b]133;A'), ob.waitFor('\u001b]133;A')]);
      a.write('echo only-$((1+1))-a\n');
      b.write('echo only-$((2+2))-b\n');
      await Promise.all([oa.waitFor('only-2-a'), ob.waitFor('only-4-b')]);
      expect(oa.text).not.toContain('only-4-b');
      expect(ob.text).not.toContain('only-2-a');
    } finally {
      await a.close();
      await b.close();
    }
  });

  it('close() terminates a running shell', async () => {
    p = await createLocalSandbox().open({ cols: 80, rows: 24 });
    const out = collect(p);
    await out.waitFor('\u001b]133;A');
    await p.close();
    await out.waitExit();
    p = undefined;
  });
});
