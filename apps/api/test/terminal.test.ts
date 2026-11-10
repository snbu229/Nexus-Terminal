import { createServer } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  TerminalServerFrameSchema,
  TerminalSessionResponseSchema,
  TerminalSessionListResponseSchema,
  type TerminalServerFrame,
} from '@nexus/contracts';
import { buildApp } from '../src/app.js';
import { loadConfig, type ApiConfig } from '../src/config.js';

const ORIGIN = 'http://127.0.0.1:5173';
const LOCAL = 'host-dev-01'; // local-sandbox
const SSH = 'host-dev-02'; // ssh-dev

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

let app: FastifyInstance;
let base: string;
let port: number;

async function start(over: Partial<ApiConfig> = {}) {
  port = await freePort();
  const config = {
    ...loadConfig({ NEXUS_DEV_MODE: '1', NEXUS_API_PORT: String(port), NEXUS_LOG_LEVEL: 'silent' }),
    ...over,
  };
  app = buildApp(config);
  await app.listen({ host: '127.0.0.1', port });
  base = `127.0.0.1:${port}`;
}
afterEach(async () => {
  await app?.close();
});

async function create(hostId = LOCAL, cols = 80, rows = 24) {
  const res = await fetch(`http://${base}/api/v0/terminal-sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hostId, cols, rows }),
  });
  return res;
}
async function createOk(hostId = LOCAL) {
  const res = await create(hostId);
  expect(res.status).toBe(201);
  return TerminalSessionResponseSchema.parse(await res.json()).session;
}

class Client {
  frames: TerminalServerFrame[] = [];
  ws: WebSocket;
  closed: Promise<number>;
  constructor(id: string, opts: { origin?: string | null } = {}) {
    this.ws = new WebSocket(`ws://${base}/api/v0/terminal-sessions/${id}/stream`, {
      headers: opts.origin === null ? {} : { origin: opts.origin ?? ORIGIN },
    });
    this.ws.on('message', (m: Buffer) =>
      this.frames.push(TerminalServerFrameSchema.parse(JSON.parse(m.toString()))),
    );
    this.closed = new Promise((r) => this.ws.once('close', (code: number) => r(code)));
  }
  opened() {
    return new Promise<void>((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
      this.ws.once('unexpected-response', (_q, r) => rej(new Error(`HTTP ${r.statusCode}`)));
    });
  }
  send(f: object) {
    this.ws.send(JSON.stringify(f));
  }
  get seqs() {
    return this.frames.flatMap((f) => (f.type === 'output' ? [f.seq] : []));
  }
  get text() {
    return this.frames
      .flatMap((f) => (f.type === 'output' ? [Buffer.from(f.data, 'base64').toString()] : []))
      .join('');
  }
  async waitFor(s: string, ms = 8000) {
    const end = Date.now() + ms;
    while (!this.text.includes(s)) {
      if (Date.now() > end) throw new Error(`timeout for ${s}; got ${JSON.stringify(this.text)}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  async waitFrame(pred: (f: TerminalServerFrame) => boolean, ms = 8000) {
    const end = Date.now() + ms;
    while (!this.frames.some(pred)) {
      if (Date.now() > end) throw new Error('timeout waiting for frame');
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}
async function connect(id: string, afterSeq = 0) {
  const c = new Client(id);
  await c.opened();
  c.send({ type: 'resume', afterSeq });
  return c;
}

beforeEach(() => start());

describe('terminal session routes', () => {
  it('creates, lists, gets and deletes a session', async () => {
    const s = await createOk();
    expect(s.hostId).toBe(LOCAL);
    expect(['starting', 'running']).toContain(s.state);
    const list = TerminalSessionListResponseSchema.parse(
      await (await fetch(`http://${base}/api/v0/terminal-sessions`)).json(),
    );
    expect(list.sessions.map((x) => x.id)).toContain(s.id);
    const got = await fetch(`http://${base}/api/v0/terminal-sessions/${s.id}`);
    expect(got.status).toBe(200);
    const del = await fetch(`http://${base}/api/v0/terminal-sessions/${s.id}`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(204);
    expect((await fetch(`http://${base}/api/v0/terminal-sessions/${s.id}`)).status).toBe(404);
    expect(
      (await fetch(`http://${base}/api/v0/terminal-sessions/${s.id}`, { method: 'DELETE' })).status,
    ).toBe(404);
  });

  it('rejects bad bodies and unknown hosts', async () => {
    for (const body of [
      {},
      { hostId: LOCAL, cols: 0, rows: 5 },
      { hostId: LOCAL, cols: 80, rows: 24, x: 1 },
    ]) {
      const res = await fetch(`http://${base}/api/v0/terminal-sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    }
    expect((await create('nope')).status).toBe(404);
  });

  it('caps concurrent sessions', async () => {
    await app.close();
    await start({ maxSessions: 2 });
    await createOk();
    await createOk();
    const res = await create();
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'too_many_sessions',
    );
  });

  it('refuses a host without a terminal provider', async () => {
    const hosts = (await (await fetch(`http://${base}/api/v0/hosts`)).json()) as {
      hosts: Array<{ id: string; terminalProvider: string }>;
    };
    const none = hosts.hosts.find((h) => h.terminalProvider === 'none');
    expect(none).toBeDefined();
    expect((await create(none?.id)).status).toBe(409);
  });
});

describe('terminal stream', () => {
  it('opens, echoes, resizes, and reports exit', async () => {
    const s = await createOk();
    const c = await connect(s.id);
    await c.waitFor('\u001b]133;A');
    c.send({ type: 'input', data: 'echo hi-$((20+22))\n' });
    await c.waitFor('hi-42');
    c.send({ type: 'resize', cols: 111, rows: 37 });
    c.send({ type: 'input', data: 'stty size\n' });
    await c.waitFor('37 111');
    c.send({ type: 'input', data: 'exit 4\n' });
    await c.waitFrame((f) => f.type === 'exit' && f.code === 4);
    await c.waitFrame((f) => f.type === 'state' && f.state === 'exited');
    const got = await (await fetch(`http://${base}/api/v0/terminal-sessions/${s.id}`)).json();
    expect(TerminalSessionResponseSchema.parse(got).session.state).toBe('exited');
    c.ws.close();
  });

  it('never exposes host secrets to the shell (env scrub)', async () => {
    const env = {
      PAPERCLIP_API_KEY: 'sekret-pk-1',
      GH_TOKEN: 'sekret-gh-2',
      GITHUB_TOKEN: 'sekret-ghub-3',
    };
    Object.assign(process.env, env);
    try {
      for (const hostId of [LOCAL, SSH]) {
        const s = await createOk(hostId);
        const c = await connect(s.id);
        await c.waitFor('\u001b]133;A');
        c.send({ type: 'input', data: 'env; echo DONE-$((3+4))\n' });
        await c.waitFor('DONE-7');
        for (const [k, v] of Object.entries(env)) {
          expect(c.text).not.toContain(k);
          expect(c.text).not.toContain(v);
        }
        c.ws.close();
      }
    } finally {
      for (const k of Object.keys(env)) delete process.env[k];
    }
  });

  it('works for an ssh-dev host', async () => {
    const s = await createOk(SSH);
    const c = await connect(s.id);
    await c.waitFor('\u001b]133;A');
    c.send({ type: 'input', data: 'echo via-ssh-$((1+1))\n' });
    await c.waitFor('via-ssh-2');
    c.ws.close();
  });

  it('survives a socket drop and resumes with no gap and no duplicates', async () => {
    const s = await createOk();
    const a = await connect(s.id);
    await a.waitFor('\u001b]133;A');
    a.send({ type: 'input', data: 'echo one-$((1+1))\n' });
    await a.waitFor('one-2');
    const lastSeen = Math.max(...a.seqs);
    a.ws.terminate(); // abrupt drop
    await a.closed;

    // The session keeps running while no socket is attached.
    const b0 = await connect(s.id, lastSeen);
    b0.send({ type: 'input', data: 'echo two-$((2+2))\n' });
    await b0.waitFor('two-4');
    b0.ws.terminate();
    await b0.closed;

    const c = await connect(s.id, lastSeen);
    c.send({ type: 'input', data: 'echo three-$((3+3))\n' });
    await c.waitFor('three-6');
    const seqs = c.seqs;
    expect(seqs[0]).toBe(lastSeen + 1); // no gap
    expect(new Set(seqs).size).toBe(seqs.length); // no duplicates
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBe((seqs[i - 1] ?? 0) + 1);
    expect(c.text).toContain('two-4');
    expect(c.text).not.toContain('one-2\r\n'); // already seen before the drop
    c.ws.close();
  });

  it('runs two sessions in parallel without crosstalk', async () => {
    const [s1, s2] = [await createOk(), await createOk()];
    const [a, b] = [await connect(s1.id), await connect(s2.id)];
    await Promise.all([a.waitFor('\u001b]133;A'), b.waitFor('\u001b]133;A')]);
    a.send({ type: 'input', data: 'echo only-$((1+1))-a\n' });
    b.send({ type: 'input', data: 'echo only-$((2+2))-b\n' });
    await Promise.all([a.waitFor('only-2-a'), b.waitFor('only-4-b')]);
    expect(a.text).not.toContain('only-4-b');
    expect(b.text).not.toContain('only-2-a');
    a.ws.close();
    b.ws.close();
  });

  it('refuses a bad or missing Origin', async () => {
    const s = await createOk();
    await expect(new Client(s.id, { origin: 'http://evil.example' }).opened()).rejects.toThrow(
      /403/,
    );
    await expect(new Client(s.id, { origin: null }).opened()).rejects.toThrow(/403/);
    await expect(new Client(s.id, { origin: `${ORIGIN}.evil.example` }).opened()).rejects.toThrow(
      /403/,
    );
  });

  it('refuses an unknown session and a disallowed Host', async () => {
    await expect(new Client('does-not-exist').opened()).rejects.toThrow(/404/);
    const s = await createOk();
    const ws = new WebSocket(`ws://${base}/api/v0/terminal-sessions/${s.id}/stream`, {
      headers: { origin: ORIGIN, host: 'evil.example' },
    });
    await expect(
      new Promise((res, rej) => {
        ws.once('open', res);
        ws.once('error', rej);
        ws.once('unexpected-response', (_q, r) => rej(new Error(`HTTP ${r.statusCode}`)));
      }),
    ).rejects.toThrow(/403/);
  });

  it('closes with 1009 on an oversized frame (A2)', async () => {
    const s = await createOk();
    const c = await connect(s.id);
    await c.waitFor('\u001b]133;A');
    c.ws.send('x'.repeat(2 * 1024 * 1024));
    expect(await c.closed).toBe(1009);
    // Session survives its socket.
    const got = await fetch(`http://${base}/api/v0/terminal-sessions/${s.id}`);
    expect(got.status).toBe(200);
  });

  it('closes with 1008 on a frame that violates the contract', async () => {
    const s = await createOk();
    for (const bad of [
      'not json',
      JSON.stringify({ type: 'nope' }),
      JSON.stringify({ type: 'input', data: 'x'.repeat(64 * 1024 + 1) }),
      JSON.stringify({ type: 'resize', cols: 0, rows: 5 }),
    ]) {
      const c = await connect(s.id);
      c.ws.send(bad);
      expect(await c.closed).toBe(1008);
    }
  });

  it('reaps idle sessions with no socket, but not attached or busy ones', async () => {
    await app.close();
    await start({ idleTimeoutMs: 150 });
    const idle = await createOk();
    const attached = await createOk();
    const c = await connect(attached.id);
    await c.waitFor('\u001b]133;A');
    await new Promise((r) => setTimeout(r, 500));
    expect((await fetch(`http://${base}/api/v0/terminal-sessions/${idle.id}`)).status).toBe(404);
    expect((await fetch(`http://${base}/api/v0/terminal-sessions/${attached.id}`)).status).toBe(
      200,
    );
    c.ws.close();
  });

  it('bounds the replay buffer: resume replays only what is retained', async () => {
    await app.close();
    await start({ replayBufferBytes: 4096 });
    const s = await createOk();
    const a = await connect(s.id);
    await a.waitFor('\u001b]133;A');
    a.send({
      type: 'input',
      data: 'for i in $(seq 1 400); do echo line-$i-padpadpadpad; done; echo END-$((5+5))\n',
    });
    await a.waitFor('END-10');
    a.ws.close();
    const b = await connect(s.id, 0);
    await b.waitFor('END-10');
    const bytes = Buffer.byteLength(b.text);
    expect(bytes).toBeLessThanOrEqual(4096 + 65536); // retained tail, not the whole history
    expect(b.text).not.toContain('line-1-pad');
    b.ws.close();
  });
});
