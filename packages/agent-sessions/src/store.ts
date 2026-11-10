import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { AgentEventSchema, type AgentEvent } from '@nexus/contracts';
import type { Checkpoint, ProcessHandle } from './adapter.js';
import { LIFECYCLE_STATES, type ExitReason, type LifecycleState } from './lifecycle.js';

/** Persisted session record (`meta.json`). Events live next to it in append-only `events.jsonl`. */
export interface SessionMeta {
  id: string;
  harness: 'mock';
  task: string;
  state: LifecycleState;
  exitReason: ExitReason | null;
  continuity: 'new' | 'reattached' | 'resumed';
  createdAt: string;
  checkpoint: Checkpoint | null;
  handle: ProcessHandle | null;
}

export const SESSION_ID_PATTERN = /^agent-[0-9a-f]{12}$/;

/**
 * File-backed store (plain JSON + JSONL, no dependencies; SQLite was not needed for dev scale).
 * Layout: <dataDir>/agent-sessions/<id>/{meta.json,events.jsonl}. Synchronous so a single writer
 * keeps meta and events in a defined order.
 */
export class FileSessionStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = join(dataDir, 'agent-sessions');
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }

  private dir(id: string): string {
    if (!SESSION_ID_PATTERN.test(id)) throw new Error('Invalid session id.');
    return join(this.root, id);
  }

  saveMeta(meta: SessionMeta): void {
    const dir = this.dir(meta.id);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = join(dir, 'meta.json.tmp');
    writeFileSync(tmp, JSON.stringify(meta), { mode: 0o600 });
    renameSync(tmp, join(dir, 'meta.json'));
  }

  appendEvent(id: string, event: AgentEvent): void {
    appendFileSync(join(this.dir(id), 'events.jsonl'), `${JSON.stringify(event)}\n`, {
      mode: 0o600,
    });
  }

  /** Loads every readable session. Unreadable or malformed sessions are reported, not trusted. */
  loadAll(): { sessions: { meta: SessionMeta; events: AgentEvent[] }[]; corrupt: string[] } {
    const sessions: { meta: SessionMeta; events: AgentEvent[] }[] = [];
    const corrupt: string[] = [];
    for (const name of readdirSync(this.root)) {
      if (!SESSION_ID_PATTERN.test(name)) continue;
      try {
        const meta = parseMeta(
          JSON.parse(readFileSync(join(this.root, name, 'meta.json'), 'utf8')),
        );
        if (meta.id !== name) throw new Error('id mismatch');
        sessions.push({ meta, events: this.readEvents(name) });
      } catch {
        corrupt.push(name);
      }
    }
    return { sessions, corrupt };
  }

  private readEvents(id: string): AgentEvent[] {
    let raw: string;
    try {
      raw = readFileSync(join(this.root, id, 'events.jsonl'), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const lines = raw.split('\n');
    // A crash mid-append can leave one torn final line; anything else malformed is corruption.
    const torn = lines.pop() !== '';
    const events = lines.map((l) => AgentEventSchema.parse(JSON.parse(l)));
    events.forEach((e, i) => {
      if (e.seq !== i + 1) throw new Error('non-contiguous seq');
    });
    // Drop the torn tail from disk too, or the next append would be glued onto it.
    if (torn)
      writeFileSync(join(this.root, id, 'events.jsonl'), lines.map((l) => `${l}\n`).join(''), {
        mode: 0o600,
      });
    return events;
  }
}

function parseMeta(v: unknown): SessionMeta {
  const m = v as Partial<SessionMeta> | null;
  if (
    !m ||
    typeof m.id !== 'string' ||
    m.harness !== 'mock' ||
    typeof m.task !== 'string' ||
    !LIFECYCLE_STATES.includes(m.state as LifecycleState) ||
    typeof m.createdAt !== 'string' ||
    !['new', 'reattached', 'resumed'].includes(m.continuity as string)
  ) {
    throw new Error('malformed meta');
  }
  return m as SessionMeta;
}
