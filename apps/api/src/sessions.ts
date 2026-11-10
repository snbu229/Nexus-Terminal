import { randomUUID } from 'node:crypto';
import {
  createLocalSandbox,
  createSshDevProvider,
  startSshTestServer,
  type SshTestServer,
  type TerminalProvider,
} from '@nexus/terminal-sandbox';
import {
  hostFixtures,
  type Host,
  type TerminalServerFrame,
  type TerminalSession,
} from '@nexus/contracts';
import type { ApiConfig } from './config.js';

/** Raw bytes per output chunk; base64 of this stays far below the contract's output limit. */
const CHUNK_BYTES = 32 * 1024;
/** Attached sockets per session. */
export const MAX_SOCKETS_PER_SESSION = 4;

export class SessionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Subscriber {
  send(frame: TerminalServerFrame): void;
}

interface Chunk {
  seq: number;
  data: Uint8Array;
}

export class Session {
  state: TerminalSession['state'] = 'starting';
  exitCode: number | undefined;
  lastActivity = Date.now();
  private chunks: Chunk[] = [];
  private bufferedBytes = 0;
  private lastSeq = 0;
  private readonly sockets = new Map<Subscriber, number>(); // subscriber -> last seq it has been sent

  constructor(
    readonly info: Omit<TerminalSession, 'state'>,
    private readonly provider: TerminalProvider,
    private readonly bufferLimit: number,
  ) {
    provider.onData((d) => this.push(d));
    provider.onExit((code) => {
      this.state = 'exited';
      this.exitCode = code;
      this.touch();
      for (const s of this.sockets.keys()) this.sendEnd(s);
    });
    this.state = 'running';
  }

  get snapshot(): TerminalSession {
    return { ...this.info, state: this.state };
  }
  get socketCount() {
    return this.sockets.size;
  }
  touch() {
    this.lastActivity = Date.now();
  }

  private push(data: Uint8Array) {
    this.touch();
    for (let off = 0; off < data.length; off += CHUNK_BYTES) {
      const part = data.subarray(off, off + CHUNK_BYTES);
      const chunk: Chunk = { seq: ++this.lastSeq, data: part };
      this.chunks.push(chunk);
      this.bufferedBytes += part.length;
      while (this.bufferedBytes > this.bufferLimit && this.chunks.length > 1) {
        this.bufferedBytes -= this.chunks.shift()?.data.length ?? 0;
      }
      for (const [sub, sent] of this.sockets) {
        if (chunk.seq > sent) {
          this.sockets.set(sub, chunk.seq);
          sub.send(outputFrame(chunk));
        }
      }
    }
  }

  private sendEnd(sub: Subscriber) {
    sub.send({ type: 'state', state: 'exited' });
    if (this.exitCode !== undefined) sub.send({ type: 'exit', code: this.exitCode });
  }

  /** Attach a socket. It receives live output only until it sends resume (see `resume`). */
  attach(sub: Subscriber): boolean {
    if (this.sockets.size >= MAX_SOCKETS_PER_SESSION) return false;
    this.touch();
    this.sockets.set(sub, this.lastSeq);
    sub.send({ type: 'state', state: this.state });
    return true;
  }
  detach(sub: Subscriber) {
    this.sockets.delete(sub);
    this.touch();
  }

  /**
   * Replays retained output after `afterSeq`, then continues live. Done synchronously so nothing is missed or
   * sent twice. Output older than the ring buffer is gone; the first replayed seq shows the gap, if any.
   */
  resume(sub: Subscriber, afterSeq: number): boolean {
    if (!this.sockets.has(sub) || afterSeq > this.lastSeq) return false;
    for (const c of this.chunks) if (c.seq > afterSeq) sub.send(outputFrame(c));
    this.sockets.set(sub, this.lastSeq);
    if (this.state === 'exited') this.sendEnd(sub);
    return true;
  }

  input(data: string) {
    this.touch();
    if (this.state === 'running') this.provider.write(data);
  }
  resize(cols: number, rows: number) {
    this.touch();
    if (this.state === 'running') this.provider.resize(cols, rows);
  }
  close(): Promise<void> {
    return this.provider.close();
  }
}

function outputFrame(c: Chunk): TerminalServerFrame {
  return { type: 'output', seq: c.seq, data: Buffer.from(c.data).toString('base64') };
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private sshServer: Promise<SshTestServer> | undefined;
  private reaper: NodeJS.Timeout | undefined;
  private closed = false;
  private reserved = 0;

  constructor(private readonly config: ApiConfig) {
    const every = Math.max(50, Math.min(30_000, Math.floor(config.idleTimeoutMs / 3)));
    this.reaper = setInterval(() => void this.reapIdle(), every);
    this.reaper.unref();
  }

  list(): TerminalSession[] {
    return [...this.sessions.values()].map((s) => s.snapshot);
  }
  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  async create(hostId: string, cols: number, rows: number): Promise<Session> {
    const host: Host | undefined = hostFixtures.find((h) => h.id === hostId);
    if (!host) throw new SessionError(404, 'not_found', 'Host not found.');
    if (host.terminalProvider === 'none') {
      throw new SessionError(
        409,
        'no_terminal',
        'This host has no terminal provider in the dev build.',
      );
    }
    if (this.closed) throw new SessionError(503, 'shutting_down', 'API is shutting down.');
    // Count in-flight creates too, so concurrent requests cannot exceed the cap.
    if (this.sessions.size + this.reserved >= this.config.maxSessions) {
      throw new SessionError(429, 'too_many_sessions', 'Too many concurrent terminal sessions.');
    }
    const id = randomUUID();
    this.reserved++;
    try {
      const provider = await this.openProvider(host, cols, rows);
      const session = new Session(
        {
          id,
          hostId,
          createdAt: new Date().toISOString(),
          title: `${host.terminalProvider === 'ssh-dev' ? 'ssh' : 'bash'} · ${host.name}`,
        },
        provider,
        this.config.replayBufferBytes,
      );
      this.sessions.set(id, session);
      return session;
    } finally {
      this.reserved--;
    }
  }
  private async openProvider(host: Host, cols: number, rows: number): Promise<TerminalProvider> {
    if (host.terminalProvider === 'local-sandbox') return createLocalSandbox().open({ cols, rows });
    this.sshServer ??= startSshTestServer();
    const server = await this.sshServer;
    return createSshDevProvider({
      host: '127.0.0.1',
      port: server.port,
      pinnedHostKeySha256: server.hostKeySha256,
      clientKey: server.clientPrivateKey,
    }).open({ cols, rows });
  }

  async delete(id: string): Promise<boolean> {
    const s = this.sessions.get(id);
    if (!s) return false;
    this.sessions.delete(id);
    await s.close();
    return true;
  }

  /** Closes sessions that have had no socket and no activity for `idleTimeoutMs`. */
  async reapIdle(now = Date.now()): Promise<number> {
    const stale = [...this.sessions].filter(
      ([, s]) => s.socketCount === 0 && now - s.lastActivity >= this.config.idleTimeoutMs,
    );
    await Promise.all(stale.map(([id]) => this.delete(id)));
    return stale.length;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.reaper) clearInterval(this.reaper);
    await Promise.all([...this.sessions.keys()].map((id) => this.delete(id)));
    if (this.sshServer) await (await this.sshServer).close();
  }
}
