import { randomBytes } from 'node:crypto';
import type { AgentEvent, AgentSession } from '@nexus/contracts';
import type { AgentHarnessAdapter, HarnessEvent } from './adapter.js';
import {
  assertTransition,
  canTransition,
  isTerminal,
  toPublicState,
  type ExitReason,
  type LifecycleState,
} from './lifecycle.js';
import { FileSessionStore, SESSION_ID_PATTERN, type SessionMeta } from './store.js';

export const MAX_ACTIVE_SESSIONS = 20;

export class SessionNotFoundError extends Error {
  override readonly name = 'SessionNotFoundError';
}
export class TooManySessionsError extends Error {
  override readonly name = 'TooManySessionsError';
}

export type EventListener = (event: AgentEvent) => void;

interface Entry {
  meta: SessionMeta;
  events: AgentEvent[];
  listeners: Set<EventListener>;
}

export interface RegistryOptions {
  dataDir: string;
  adapter: AgentHarnessAdapter;
  now?: () => Date;
}

export interface RecoveryReport {
  reattached: string[];
  resumed: string[];
  failed: string[];
  /** Session directories that could not be loaded; never trusted or deleted. */
  corrupt: string[];
}

/**
 * Owns every agent session: lifecycle, seq-numbered append-only events and persistence.
 * It is the only writer. Adapters report raw events; the registry numbers and stores them.
 */
export class AgentSessionRegistry {
  private readonly store: FileSessionStore;
  private readonly adapter: AgentHarnessAdapter;
  private readonly now: () => Date;
  private readonly sessions = new Map<string, Entry>();

  constructor(opts: RegistryOptions) {
    this.store = new FileSessionStore(opts.dataDir);
    this.adapter = opts.adapter;
    this.now = opts.now ?? (() => new Date());
  }

  // --- queries --------------------------------------------------------------
  list(): AgentSession[] {
    return [...this.sessions.values()]
      .map((e) => this.view(e))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(id: string): AgentSession | undefined {
    const e = this.sessions.get(id);
    return e ? this.view(e) : undefined;
  }

  /** Events with seq > afterSeq, in order. */
  eventsAfter(id: string, afterSeq: number): AgentEvent[] {
    const e = this.require(id);
    return e.events.slice(Math.max(0, afterSeq));
  }

  /**
   * Replays events after `afterSeq` and subscribes to later ones in one synchronous step, so
   * nothing can be missed or delivered twice between the replay and the live stream.
   */
  subscribe(id: string, afterSeq: number, listener: EventListener): () => void {
    const e = this.require(id);
    for (const ev of e.events.slice(Math.max(0, afterSeq))) listener(ev);
    e.listeners.add(listener);
    return () => void e.listeners.delete(listener);
  }

  // --- commands -------------------------------------------------------------
  async create(task: string): Promise<AgentSession> {
    const active = [...this.sessions.values()].filter((e) => !isTerminal(e.meta.state)).length;
    if (active >= MAX_ACTIVE_SESSIONS)
      throw new TooManySessionsError('Too many active agent sessions.');
    const meta: SessionMeta = {
      id: `agent-${randomBytes(6).toString('hex')}`,
      harness: 'mock',
      task,
      state: 'created',
      exitReason: null,
      continuity: 'new',
      createdAt: this.now().toISOString(),
      checkpoint: null,
      handle: null,
    };
    const entry: Entry = { meta, events: [], listeners: new Set() };
    this.sessions.set(meta.id, entry);
    this.store.saveMeta(meta);
    await this.launch(entry, null);
    return this.view(entry);
  }

  async stop(id: string): Promise<AgentSession> {
    const entry = this.require(id);
    if (isTerminal(entry.meta.state) || entry.meta.state === 'stopping') return this.view(entry);
    this.transition(entry, 'stopping');
    const handle = entry.meta.handle;
    if (handle) await this.adapter.stop(handle);
    // The process reports its exit event synchronously from stop(); if it was already gone, close it here.
    if (!isTerminal(entry.meta.state)) this.finish(entry, 'exited', 'stopped', 143);
    return this.view(entry);
  }

  /**
   * Called once after a registry restart. For each unfinished session, asks the adapter whether the
   * very same process is alive (reattached), else re-creates it from a checkpoint if the adapter can
   * (resumed), else marks the session failed. It never relabels one outcome as another.
   */
  async recover(): Promise<RecoveryReport> {
    const { sessions, corrupt } = this.store.loadAll();
    const report: RecoveryReport = { reattached: [], resumed: [], failed: [], corrupt };
    for (const { meta, events } of sessions) {
      const entry: Entry = { meta, events, listeners: new Set() };
      this.sessions.set(meta.id, entry);
      if (isTerminal(meta.state)) continue;
      const alive = meta.handle !== null && (await this.adapter.probe(meta.handle)) === 'alive';
      if (alive && meta.handle) {
        meta.continuity = 'reattached';
        this.store.saveMeta(meta);
        this.append(entry, {
          kind: 'output',
          text: '[registry] reattached to the running process',
        });
        await this.adapter.attach(meta.handle, this.sinkFor(entry));
        report.reattached.push(meta.id);
      } else if (meta.state === 'stopping') {
        this.finish(entry, 'exited', 'stopped', 143);
      } else if (this.adapter.capabilities.resumeFromCheckpoint && meta.checkpoint !== null) {
        meta.continuity = 'resumed';
        meta.handle = null;
        this.append(entry, {
          kind: 'output',
          text: `[registry] process was lost; resumed from checkpoint ${meta.checkpoint.step} (new process)`,
        });
        // Recovery re-entry: a new process is being started, so the session is 'starting' again.
        // This is the one deliberate bypass of the transition table.
        meta.state = 'starting';
        this.store.saveMeta(meta);
        try {
          await this.launch(entry, meta.checkpoint);
          report.resumed.push(meta.id);
        } catch {
          report.failed.push(meta.id);
        }
      } else {
        this.failSession(entry, 'process was lost and cannot be resumed');
        report.failed.push(meta.id);
      }
    }
    return report;
  }

  /** Detaches live processes from this registry (they keep running); used on shutdown. */
  close(): void {
    for (const e of this.sessions.values()) {
      if (e.meta.handle && !isTerminal(e.meta.state)) this.adapter.detach(e.meta.handle);
      e.listeners.clear();
    }
  }

  // --- internals ------------------------------------------------------------
  private require(id: string): Entry {
    const e = SESSION_ID_PATTERN.test(id) ? this.sessions.get(id) : undefined;
    if (!e) throw new SessionNotFoundError('Agent session not found.');
    return e;
  }

  private view(e: Entry): AgentSession {
    return {
      id: e.meta.id,
      harness: e.meta.harness,
      task: e.meta.task,
      state: toPublicState(e.meta.state, e.meta.exitReason),
      continuity: e.meta.continuity,
      createdAt: e.meta.createdAt,
      lastEventSeq: e.events.at(-1)?.seq ?? 0,
    };
  }

  private async launch(entry: Entry, checkpoint: SessionMeta['checkpoint']): Promise<void> {
    if (entry.meta.state === 'created') this.transition(entry, 'starting');
    try {
      const handle = await this.adapter.start(
        { sessionId: entry.meta.id, task: entry.meta.task, checkpoint },
        this.sinkFor(entry),
      );
      entry.meta.handle = handle;
      this.store.saveMeta(entry.meta);
    } catch {
      this.failSession(entry, 'harness failed to start');
      throw new Error('Harness failed to start.');
    }
  }

  private sinkFor(entry: Entry): (e: HarnessEvent) => void {
    return (e) => this.onHarnessEvent(entry, e);
  }

  private onHarnessEvent(entry: Entry, e: HarnessEvent): void {
    const state = entry.meta.state;
    if (isTerminal(state)) return;
    switch (e.kind) {
      case 'running':
        if (state === 'starting' || state === 'needs_input') {
          this.transition(entry, 'running');
          this.append(entry, { kind: 'status', state: 'running' });
        }
        return;
      case 'output':
        this.append(entry, { kind: 'output', text: e.text });
        return;
      case 'tool_call':
        this.append(entry, { kind: 'tool_call', tool: e.tool, summary: e.summary });
        return;
      case 'needs_input':
        if (state === 'running') {
          this.transition(entry, 'needs_input');
          this.append(entry, { kind: 'needs_input', prompt: e.prompt });
        }
        return;
      case 'checkpoint':
        entry.meta.checkpoint = e.checkpoint;
        this.store.saveMeta(entry.meta);
        return;
      case 'exit':
        if (e.reason === 'error') this.failSession(entry, 'harness reported an error', e.code);
        else this.finish(entry, 'exited', e.reason, e.code);
        return;
    }
  }

  private transition(entry: Entry, to: LifecycleState): void {
    assertTransition(entry.meta.state, to);
    entry.meta.state = to;
    this.store.saveMeta(entry.meta);
  }

  private finish(entry: Entry, to: 'exited', reason: ExitReason, code: number): void {
    // Stopping from needs_input/starting goes through stopping first; ensure the path is legal.
    if (entry.meta.state !== 'stopping' && reason === 'stopped') this.transition(entry, 'stopping');
    if (!canTransition(entry.meta.state, to)) {
      this.failSession(entry, `unexpected exit while ${entry.meta.state}`, code);
      return;
    }
    entry.meta.exitReason = reason;
    this.transition(entry, to);
    if (reason === 'stopped') this.append(entry, { kind: 'status', state: 'stopped' });
    this.append(entry, { kind: 'exit', code });
  }

  private failSession(entry: Entry, why: string, code = 1): void {
    if (isTerminal(entry.meta.state)) return;
    entry.meta.exitReason = 'error';
    this.transition(entry, 'failed');
    this.append(entry, { kind: 'output', text: `[registry] session failed: ${why}` });
    this.append(entry, { kind: 'exit', code });
  }

  private append(entry: Entry, body: DistributiveOmit<AgentEvent, 'seq' | 'ts'>): void {
    const event = {
      ...body,
      seq: (entry.events.at(-1)?.seq ?? 0) + 1,
      ts: this.now().toISOString(),
    } as AgentEvent;
    // Persist first: an event a client has seen must survive a restart.
    this.store.appendEvent(entry.meta.id, event);
    entry.events.push(event);
    for (const l of [...entry.listeners]) {
      try {
        l(event);
      } catch {
        entry.listeners.delete(l);
      }
    }
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
