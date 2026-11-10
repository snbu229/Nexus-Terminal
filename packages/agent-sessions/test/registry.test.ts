import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentEventSchema, AgentSessionSchema, type AgentEvent } from '@nexus/contracts';
import {
  AgentSessionRegistry,
  MAX_ACTIVE_SESSIONS,
  MockHarnessAdapter,
  SessionNotFoundError,
  TooManySessionsError,
  type MockAdapterOptions,
} from '../src/index.js';

let dir: string;
let adapters: MockHarnessAdapter[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nexus-agent-sessions-'));
  adapters = [];
});
afterEach(() => {
  for (const a of adapters) a.dispose();
  rmSync(dir, { recursive: true, force: true });
});

const fast: MockAdapterOptions = { stepDelayMs: 5, needsInputMs: 40 };
function mkAdapter(opts: MockAdapterOptions = fast) {
  const a = new MockHarnessAdapter(opts);
  adapters.push(a);
  return a;
}
const mkRegistry = (adapter: MockHarnessAdapter) =>
  new AgentSessionRegistry({ dataDir: dir, adapter });

async function waitFor(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 2));
  }
}

function assertContiguous(events: AgentEvent[]) {
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  for (const e of events) AgentEventSchema.parse(e);
}
const diskEvents = (id: string) =>
  readFileSync(join(dir, 'agent-sessions', id, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as AgentEvent);

describe('mock agent run', () => {
  it('runs output, tool call, needs_input pause, and exits cleanly with contiguous seq', async () => {
    const reg = mkRegistry(mkAdapter());
    const s = await reg.create('refactor build');
    AgentSessionSchema.parse(s);
    expect(s.continuity).toBe('new');
    await waitFor(() => reg.get(s.id)?.state === 'exited');
    const events = reg.eventsAfter(s.id, 0);
    assertContiguous(events);
    expect(events.map((e) => e.kind)).toEqual([
      'status',
      'output',
      'tool_call',
      'needs_input',
      'status',
      'output',
      'exit',
    ]);
    expect(events.at(-1)).toMatchObject({ kind: 'exit', code: 0 });
    expect(reg.get(s.id)?.lastEventSeq).toBe(events.length);
    expect(diskEvents(s.id)).toEqual(events);
  });

  it('reports needs_input while paused', async () => {
    const reg = mkRegistry(mkAdapter({ stepDelayMs: 5, needsInputMs: 1000 }));
    const s = await reg.create('x');
    await waitFor(() => reg.get(s.id)?.state === 'needs_input');
    expect(reg.eventsAfter(s.id, 0).at(-1)?.kind).toBe('needs_input');
  });

  it('throws SessionNotFoundError for unknown or malformed ids (no path from user input)', () => {
    const reg = mkRegistry(mkAdapter());
    expect(() => reg.eventsAfter('agent-000000000000', 0)).toThrow(SessionNotFoundError);
    expect(() => reg.eventsAfter('../../etc/passwd', 0)).toThrow(SessionNotFoundError);
    expect(reg.get('../x')).toBeUndefined();
  });

  it('caps active sessions', async () => {
    const reg = mkRegistry(mkAdapter({ stepDelayMs: 5, needsInputMs: 10_000 }));
    for (let i = 0; i < MAX_ACTIVE_SESSIONS; i++) await reg.create('t');
    await expect(reg.create('t')).rejects.toBeInstanceOf(TooManySessionsError);
  });
});

describe('socket drop and resume (afterSeq)', () => {
  it('a subscriber that drops and resumes gets every event exactly once', async () => {
    const reg = mkRegistry(mkAdapter({ stepDelayMs: 10, needsInputMs: 30 }));
    const s = await reg.create('x');
    const first: AgentEvent[] = [];
    const off = reg.subscribe(s.id, 0, (e) => first.push(e));
    await waitFor(() => first.length >= 3);
    off(); // socket dropped
    const lastSeen = first.at(-1)!.seq;
    await waitFor(() => reg.get(s.id)?.state === 'exited');
    const second: AgentEvent[] = [];
    reg.subscribe(s.id, lastSeen, (e) => second.push(e));
    assertContiguous([...first, ...second]);
    expect([...first, ...second]).toEqual(reg.eventsAfter(s.id, 0));
  });

  it('afterSeq beyond the end replays nothing; live events still arrive', async () => {
    const reg = mkRegistry(mkAdapter());
    const s = await reg.create('x');
    const got: AgentEvent[] = [];
    reg.subscribe(s.id, 1000, (e) => got.push(e));
    await waitFor(() => reg.get(s.id)?.state === 'exited');
    expect(got.length).toBeGreaterThan(0);
  });
});

describe('stop', () => {
  it('stops a running session: stopped state, stopped status then exit 143, no more events', async () => {
    const reg = mkRegistry(mkAdapter({ stepDelayMs: 5, needsInputMs: 10_000 }));
    const s = await reg.create('x');
    await waitFor(() => reg.get(s.id)?.state === 'needs_input');
    const stopped = await reg.stop(s.id);
    expect(stopped.state).toBe('stopped');
    const events = reg.eventsAfter(s.id, 0);
    assertContiguous(events);
    expect(events.slice(-2)).toMatchObject([
      { kind: 'status', state: 'stopped' },
      { kind: 'exit', code: 143 },
    ]);
    const n = events.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(reg.eventsAfter(s.id, 0)).toHaveLength(n);
  });

  it('stop on a finished session is a no-op', async () => {
    const reg = mkRegistry(mkAdapter());
    const s = await reg.create('x');
    await waitFor(() => reg.get(s.id)?.state === 'exited');
    const n = reg.eventsAfter(s.id, 0).length;
    expect((await reg.stop(s.id)).state).toBe('exited');
    expect(reg.eventsAfter(s.id, 0)).toHaveLength(n);
  });
});

describe('API restart recovery', () => {
  it('live process: reattached (same process), no gap or duplicate even for events produced while down', async () => {
    const adapter = mkAdapter({ stepDelayMs: 15, needsInputMs: 30 });
    const reg1 = mkRegistry(adapter);
    const s = await reg1.create('x');
    await waitFor(() => reg1.eventsAfter(s.id, 0).length >= 2);
    const handle1 = JSON.parse(
      readFileSync(join(dir, 'agent-sessions', s.id, 'meta.json'), 'utf8'),
    ).handle;
    reg1.close(); // API process goes away; the mock process keeps running and buffers

    const reg2 = mkRegistry(adapter);
    const report = await reg2.recover();
    expect(report).toMatchObject({ reattached: [s.id], resumed: [], failed: [] });
    expect(reg2.get(s.id)?.continuity).toBe('reattached');
    const handle2 = JSON.parse(
      readFileSync(join(dir, 'agent-sessions', s.id, 'meta.json'), 'utf8'),
    ).handle;
    expect(handle2).toEqual(handle1);
    await waitFor(() => reg2.get(s.id)?.state === 'exited');
    const events = reg2.eventsAfter(s.id, 0);
    assertContiguous(events);
    expect(diskEvents(s.id)).toEqual(events);
    // one run only: a single completed exit, not a second process
    expect(events.filter((e) => e.kind === 'exit')).toHaveLength(1);
  });

  it('dead process with checkpoint: resumed (new process), labelled resumed, never reattached', async () => {
    const adapter1 = mkAdapter({ stepDelayMs: 10, needsInputMs: 10_000 });
    const reg1 = mkRegistry(adapter1);
    const s = await reg1.create('x');
    await waitFor(() => reg1.get(s.id)?.state === 'needs_input');
    const before = reg1.eventsAfter(s.id, 0).length;
    reg1.close();
    adapter1.dispose(); // real restart: the in-memory mock is gone
    const handle1 = JSON.parse(
      readFileSync(join(dir, 'agent-sessions', s.id, 'meta.json'), 'utf8'),
    ).handle;

    const adapter2 = mkAdapter({ stepDelayMs: 5, needsInputMs: 10 });
    const reg2 = mkRegistry(adapter2);
    const report = await reg2.recover();
    expect(report).toMatchObject({ reattached: [], resumed: [s.id], failed: [] });
    expect(reg2.get(s.id)?.continuity).toBe('resumed');
    const handle2 = JSON.parse(
      readFileSync(join(dir, 'agent-sessions', s.id, 'meta.json'), 'utf8'),
    ).handle;
    expect(handle2.processId).not.toBe(handle1.processId);
    await waitFor(() => reg2.get(s.id)?.state === 'exited');
    const events = reg2.eventsAfter(s.id, 0);
    assertContiguous(events);
    expect(events.length).toBeGreaterThan(before);
    expect(
      events.some((e) => e.kind === 'output' && e.text.includes('resumed from checkpoint')),
    ).toBe(true);
    expect(events.some((e) => e.kind === 'output' && e.text.includes('reattached'))).toBe(false);
  });

  it('resume whose start() rejects: failed, never labelled resumed (API view and event log)', async () => {
    const adapter1 = mkAdapter({ stepDelayMs: 10, needsInputMs: 10_000 });
    const reg1 = mkRegistry(adapter1);
    const s = await reg1.create('x');
    await waitFor(() => reg1.get(s.id)?.state === 'needs_input');
    reg1.close();
    adapter1.dispose();

    class FailingStart extends MockHarnessAdapter {
      override async start(): Promise<never> {
        throw new Error('boom');
      }
    }
    const adapter2 = new FailingStart(fast);
    adapters.push(adapter2);
    const reg2 = mkRegistry(adapter2);
    const report = await reg2.recover();
    expect(report).toMatchObject({ reattached: [], resumed: [], failed: [s.id] });
    const view = reg2.get(s.id)!;
    expect(view.state).toBe('exited');
    expect(view.continuity).toBe('new');
    const events = reg2.eventsAfter(s.id, 0);
    assertContiguous(events);
    expect(events.some((e) => e.kind === 'output' && /resumed from checkpoint/.test(e.text))).toBe(
      false,
    );
    expect(events.at(-1)).toMatchObject({ kind: 'exit', code: 1 });
    expect(diskEvents(s.id)).toEqual(events);
  });

  it('reattach whose attach() rejects: session failed, startup not aborted, never labelled reattached', async () => {
    const adapter = mkAdapter({ stepDelayMs: 15, needsInputMs: 10_000 });
    const reg1 = mkRegistry(adapter);
    const s = await reg1.create('x');
    await waitFor(() => reg1.eventsAfter(s.id, 0).length >= 2);
    reg1.close();

    adapter.attach = async () => {
      throw new Error('boom');
    };
    const reg2 = mkRegistry(adapter);
    const report = await reg2.recover();
    expect(report).toMatchObject({ reattached: [], resumed: [], failed: [s.id] });
    const view = reg2.get(s.id)!;
    expect(view.state).toBe('exited');
    expect(view.continuity).toBe('new');
    const events = reg2.eventsAfter(s.id, 0);
    assertContiguous(events);
    expect(events.some((e) => e.kind === 'output' && /reattached/.test(e.text))).toBe(false);
    expect(events.at(-1)).toMatchObject({ kind: 'exit', code: 1 });
  });

  it('dead process, harness cannot resume: failed, labelled, not claimed as resumed', async () => {
    const adapter1 = mkAdapter({ stepDelayMs: 10, needsInputMs: 10_000 });
    const reg1 = mkRegistry(adapter1);
    const s = await reg1.create('x');
    await waitFor(() => reg1.get(s.id)?.state === 'needs_input');
    reg1.close();
    adapter1.dispose();

    const reg2 = mkRegistry(mkAdapter({ ...fast, resumeFromCheckpoint: false }));
    const report = await reg2.recover();
    expect(report).toMatchObject({ reattached: [], resumed: [], failed: [s.id] });
    const view = reg2.get(s.id)!;
    expect(view.state).toBe('exited');
    expect(view.continuity).toBe('new');
    const events = reg2.eventsAfter(s.id, 0);
    assertContiguous(events);
    expect(events.at(-2)).toMatchObject({ kind: 'output' });
    expect((events.at(-2) as { text: string }).text).toContain('cannot be resumed');
    expect(events.at(-1)).toMatchObject({ kind: 'exit', code: 1 });
  });

  it('dead process before any checkpoint: failed', async () => {
    const adapter1 = mkAdapter({ stepDelayMs: 10_000, needsInputMs: 10 });
    const reg1 = mkRegistry(adapter1);
    const s = await reg1.create('x');
    reg1.close();
    adapter1.dispose();
    const reg2 = mkRegistry(mkAdapter());
    expect((await reg2.recover()).failed).toEqual([s.id]);
  });

  it('a session stopped before the restart stays stopped and is not restarted', async () => {
    const adapter = mkAdapter({ stepDelayMs: 5, needsInputMs: 10_000 });
    const reg1 = mkRegistry(adapter);
    const s = await reg1.create('x');
    await waitFor(() => reg1.get(s.id)?.state === 'needs_input');
    await reg1.stop(s.id);
    const n = reg1.eventsAfter(s.id, 0).length;
    reg1.close();
    const reg2 = mkRegistry(mkAdapter());
    const report = await reg2.recover();
    expect(report).toMatchObject({ reattached: [], resumed: [], failed: [] });
    expect(reg2.get(s.id)?.state).toBe('stopped');
    expect(reg2.eventsAfter(s.id, 0)).toHaveLength(n);
  });

  it('survives a torn final event line and keeps seq contiguous afterwards', async () => {
    const adapter1 = mkAdapter({ stepDelayMs: 10, needsInputMs: 10_000 });
    const reg1 = mkRegistry(adapter1);
    const s = await reg1.create('x');
    await waitFor(() => reg1.get(s.id)?.state === 'needs_input');
    reg1.close();
    adapter1.dispose();
    const file = join(dir, 'agent-sessions', s.id, 'events.jsonl');
    appendFileSync(file, '{"seq":99,"ts":"2026-11-1');
    const reg2 = mkRegistry(mkAdapter());
    await reg2.recover();
    await waitFor(() => reg2.get(s.id)?.state === 'exited');
    assertContiguous(reg2.eventsAfter(s.id, 0));
    assertContiguous(diskEvents(s.id));
  });

  it('does not trust a corrupt session directory (seq gap): reported, not loaded', async () => {
    const id = 'agent-0123456789ab';
    mkdirSync(join(dir, 'agent-sessions', id), { recursive: true });
    writeFileSync(
      join(dir, 'agent-sessions', id, 'meta.json'),
      JSON.stringify({
        id,
        harness: 'mock',
        task: 't',
        state: 'running',
        exitReason: null,
        continuity: 'new',
        createdAt: '2026-11-10T00:00:00.000Z',
        checkpoint: null,
        handle: null,
      }),
    );
    writeFileSync(
      join(dir, 'agent-sessions', id, 'events.jsonl'),
      `${JSON.stringify({ seq: 2, ts: '2026-11-10T00:00:00.000Z', kind: 'exit', code: 0 })}\n`,
    );
    const reg = mkRegistry(mkAdapter());
    const report = await reg.recover();
    expect(report.corrupt).toEqual([id]);
    expect(reg.get(id)).toBeUndefined();
  });
});
