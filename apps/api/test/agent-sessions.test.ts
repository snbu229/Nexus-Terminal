import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  AgentEventSchema,
  AgentSessionListResponseSchema,
  AgentSessionResponseSchema,
  ErrorResponseSchema,
  type AgentEvent,
} from '@nexus/contracts';
import { AgentSessionRegistry, MockHarnessAdapter } from '@nexus/agent-sessions';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const HOST = '127.0.0.1:3000';
const ORIGIN = 'http://127.0.0.1:5173';
let dir: string;
let apps: FastifyInstance[];
let adapters: MockHarnessAdapter[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nexus-api-agents-'));
  apps = [];
  adapters = [];
});
afterEach(async () => {
  for (const a of apps) await a.close();
  for (const a of adapters) a.dispose();
  rmSync(dir, { recursive: true, force: true });
});

function mkAdapter(stepDelayMs = 5, needsInputMs = 30) {
  const a = new MockHarnessAdapter({ stepDelayMs, needsInputMs });
  adapters.push(a);
  return a;
}

async function start(adapter: MockHarnessAdapter) {
  const config = loadConfig({
    NEXUS_DEV_MODE: '1',
    NEXUS_DEV_DATA_DIR: dir,
    NEXUS_LOG_LEVEL: 'silent',
  });
  const registry = new AgentSessionRegistry({ dataDir: dir, adapter });
  const app = buildApp(config, { registry });
  apps.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const port = (app.server.address() as { port: number }).port;
  return { app, port };
}

const headers = { host: HOST };
async function waitFor(cond: () => boolean | Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 3));
  }
}

function openWs(port: number, id: string, origin: string | undefined = ORIGIN) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v0/agent-sessions/${id}/events`, {
    headers: { host: HOST, ...(origin ? { origin } : {}) },
  });
  const events: AgentEvent[] = [];
  ws.on('message', (d) => events.push(AgentEventSchema.parse(JSON.parse(d.toString()))));
  const opened = new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
    ws.once('unexpected-response', (_q, r) => {
      r.resume();
      ws.on('error', () => undefined);
      ws.terminate();
      rej(new Error(`HTTP ${r.statusCode}`));
    });
  });
  const closed = new Promise<number>((res) => ws.once('close', (code) => res(code)));
  return { ws, events, opened, closed };
}

async function create(app: FastifyInstance, task = 'do a thing') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v0/agent-sessions',
    headers,
    payload: { harness: 'mock', task },
  });
  return {
    res,
    session:
      res.statusCode === 201 ? AgentSessionResponseSchema.parse(res.json()).session : undefined,
  };
}

describe('REST', () => {
  it('create, list, get, stop with contract-shaped responses', async () => {
    const { app } = await start(mkAdapter(5, 10_000));
    const { res, session } = await create(app);
    expect(res.statusCode).toBe(201);
    expect(session?.continuity).toBe('new');
    const list = AgentSessionListResponseSchema.parse(
      (await app.inject({ url: '/api/v0/agent-sessions', headers })).json(),
    );
    expect(list.sessions.map((s) => s.id)).toEqual([session!.id]);
    expect(
      (await app.inject({ url: `/api/v0/agent-sessions/${session!.id}`, headers })).statusCode,
    ).toBe(200);
    const stop = await app.inject({
      method: 'POST',
      url: `/api/v0/agent-sessions/${session!.id}/stop`,
      headers,
    });
    expect(stop.statusCode).toBe(200);
    expect(AgentSessionResponseSchema.parse(stop.json()).session.state).toBe('stopped');
  });

  it('rejects bad bodies (400), unknown ids (404) and path-like ids', async () => {
    const { app } = await start(mkAdapter());
    for (const payload of [
      {},
      { harness: 'codex', task: 'x' },
      { harness: 'mock', task: '' },
      { harness: 'mock', task: 'x', extra: 1 },
      { harness: 'mock', task: 'x'.repeat(2001) },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v0/agent-sessions',
        headers,
        payload,
      });
      expect(res.statusCode, JSON.stringify(payload).slice(0, 40)).toBe(400);
      ErrorResponseSchema.parse(res.json());
    }
    for (const id of ['agent-000000000000', '..%2F..%2Fetc', 'x']) {
      expect((await app.inject({ url: `/api/v0/agent-sessions/${id}`, headers })).statusCode).toBe(
        404,
      );
      expect(
        (await app.inject({ method: 'POST', url: `/api/v0/agent-sessions/${id}/stop`, headers }))
          .statusCode,
      ).toBe(404);
    }
  });
});

describe('WS /api/v0/agent-sessions/:id/events', () => {
  it('streams events after a resume frame, contiguous, until exit', async () => {
    const { app, port } = await start(mkAdapter());
    const { session } = await create(app);
    const c = openWs(port, session!.id);
    await c.opened;
    c.ws.send(JSON.stringify({ type: 'resume', afterSeq: 0 }));
    await waitFor(() => c.events.at(-1)?.kind === 'exit');
    expect(c.events.map((e) => e.seq)).toEqual(c.events.map((_, i) => i + 1));
    c.ws.close();
  });

  it('socket drop and resume: second socket with afterSeq gets only the missing events', async () => {
    const { app, port } = await start(mkAdapter(10, 30));
    const { session } = await create(app);
    const a = openWs(port, session!.id);
    await a.opened;
    a.ws.send(JSON.stringify({ type: 'resume', afterSeq: 0 }));
    await waitFor(() => a.events.length >= 2);
    a.ws.terminate();
    const last = a.events.at(-1)!.seq;
    const b = openWs(port, session!.id);
    await b.opened;
    b.ws.send(JSON.stringify({ type: 'resume', afterSeq: last }));
    await waitFor(() => b.events.at(-1)?.kind === 'exit');
    const all = [...a.events.filter((e) => e.seq <= last), ...b.events];
    expect(all.map((e) => e.seq)).toEqual(all.map((_, i) => i + 1));
    b.ws.close();
  });

  it('API restart with a live mock: reattached, stream continues without gaps', async () => {
    const adapter = mkAdapter(15, 30);
    const first = await start(adapter);
    const { session } = await create(first.app);
    await waitFor(async () => {
      const r = await first.app.inject({ url: `/api/v0/agent-sessions/${session!.id}`, headers });
      return AgentSessionResponseSchema.parse(r.json()).session.lastEventSeq >= 2;
    });
    await first.app.close();
    const second = await start(adapter);
    const got = AgentSessionResponseSchema.parse(
      (await second.app.inject({ url: `/api/v0/agent-sessions/${session!.id}`, headers })).json(),
    ).session;
    expect(got.continuity).toBe('reattached');
    const c = openWs(second.port, session!.id);
    await c.opened;
    c.ws.send(JSON.stringify({ type: 'resume', afterSeq: 0 }));
    await waitFor(() => c.events.at(-1)?.kind === 'exit');
    expect(c.events.map((e) => e.seq)).toEqual(c.events.map((_, i) => i + 1));
    expect(c.events.filter((e) => e.kind === 'exit')).toHaveLength(1);
    c.ws.close();
  });

  it('API restart after the mock died: resumed from checkpoint and labelled resumed', async () => {
    const a1 = mkAdapter(10, 10_000);
    const first = await start(a1);
    const { session } = await create(first.app);
    await waitFor(async () => {
      const r = await first.app.inject({ url: `/api/v0/agent-sessions/${session!.id}`, headers });
      return AgentSessionResponseSchema.parse(r.json()).session.state === 'needs_input';
    });
    await first.app.close();
    a1.dispose();
    const second = await start(mkAdapter(5, 10));
    const got = AgentSessionResponseSchema.parse(
      (await second.app.inject({ url: `/api/v0/agent-sessions/${session!.id}`, headers })).json(),
    ).session;
    expect(got.continuity).toBe('resumed');
    const c = openWs(second.port, session!.id);
    await c.opened;
    c.ws.send(JSON.stringify({ type: 'resume', afterSeq: 0 }));
    await waitFor(() => c.events.at(-1)?.kind === 'exit');
    expect(c.events.map((e) => e.seq)).toEqual(c.events.map((_, i) => i + 1));
    c.ws.close();
  });

  it('rejects a foreign Origin and a foreign Host at the handshake', async () => {
    const { app, port } = await start(mkAdapter());
    const { session } = await create(app);
    await expect(openWs(port, session!.id, 'http://evil.example').opened).rejects.toThrow(
      'HTTP 403',
    );
    const badHost = new WebSocket(
      `ws://127.0.0.1:${port}/api/v0/agent-sessions/${session!.id}/events`,
      {
        headers: { host: 'evil.example' },
      },
    );
    await new Promise<void>((res) =>
      badHost.once('unexpected-response', (_q, r) => {
        expect(r.statusCode).toBe(403);
        r.resume();
        badHost.on('error', () => undefined);
        badHost.terminate();
        res();
      }),
    );
  });

  it('closes on an invalid first frame, an oversized frame, a repeated resume and an unknown session', async () => {
    const { app, port } = await start(mkAdapter(5, 10_000));
    const { session } = await create(app);
    for (const bad of [
      'not json',
      JSON.stringify({ type: 'resume', afterSeq: -1 }),
      JSON.stringify({ type: 'resume', afterSeq: 0, x: 1 }),
      JSON.stringify({ type: 'input', data: 'rm -rf' }),
    ]) {
      const c = openWs(port, session!.id);
      await c.opened;
      c.ws.send(bad);
      expect(await c.closed).toBe(1008);
    }
    const big = openWs(port, session!.id);
    await big.opened;
    big.ws.send('x'.repeat(5000));
    expect(await big.closed).toBe(1009);
    const twice = openWs(port, session!.id);
    await twice.opened;
    twice.ws.send(JSON.stringify({ type: 'resume', afterSeq: 0 }));
    twice.ws.send(JSON.stringify({ type: 'resume', afterSeq: 0 }));
    expect(await twice.closed).toBe(1008);
    const unknown = openWs(port, 'agent-000000000000');
    await unknown.opened;
    expect(await unknown.closed).toBe(1008);
  });
});
