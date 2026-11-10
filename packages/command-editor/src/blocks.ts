/**
 * Command blocks built from OSC 133 A/B/C/D events (spec §5, BR-8).
 * M-D1 dev track: markers are NOT authenticated (BR-12 nonce is not implemented), so every block
 * carries the trust label below and the UI must show it.
 */

export const MARKER_TRUST_LABEL = 'unauthenticated dev markers' as const;

export interface MarkerEvent {
  kind: 'A' | 'B' | 'C' | 'D';
  /** Monotonic sequence number (event log) or arrival order (in-band). */
  seq: number;
  /** Milliseconds. */
  ts: number;
  /** D: exit status. Absent or non-numeric means unknown. */
  exit?: number;
  /** A: working directory at the prompt. */
  cwd?: string;
  /** C: command line, when the integration reports it. */
  cmdline?: string;
  /** C/D: offset into the connector's output ring where output starts / ends. */
  outputOffset?: number;
}

export interface CommandBlock {
  id: string;
  trust: typeof MARKER_TRUST_LABEL;
  promptSeq: number | null;
  command: string;
  /** C.cmdline as reported by the (unauthenticated) integration; never overrides `command` once recorded. */
  reportedCommand: string | 'unknown';
  cwd: string;
  outputRange: { start: number | null; end: number | null };
  exitCode: number | 'unknown';
  durationMs: number | 'unknown';
  status: 'prompt' | 'input' | 'running' | 'finished' | 'incomplete';
}

interface Working extends CommandBlock {
  startTs: number | null;
  hasRun: boolean;
  recorded: boolean;
}

export class BlockBuilder {
  private done: CommandBlock[] = [];
  private cur: Working | null = null;
  private lastSeq = -Infinity;
  private counter = 0;
  /** After an anomaly, events are dropped until the next A (spec §5: drop grouping for that block). */
  private skipping = false;

  /** Finished and incomplete blocks, oldest first. Bare prompts never appear here. */
  get blocks(): readonly CommandBlock[] {
    return this.done;
  }
  /** The block still being built (prompt, input or running), if any. */
  get current(): Readonly<CommandBlock> | null {
    return this.cur;
  }

  /** Attach the confirmed command text to the open block (the connector knows what it sent). */
  recordCommand(text: string): void {
    if (this.cur) {
      this.cur.command = text;
      this.cur.recorded = true;
    }
  }

  /** Drop grouping for the open block: a run block closes as `incomplete`, a bare prompt is discarded. */
  abandon(): void {
    this.closeOpen();
    this.skipping = true;
  }

  ingest(e: MarkerEvent): void {
    if (e.seq <= this.lastSeq) return; // duplicate or reordered
    this.lastSeq = e.seq;
    if (this.skipping && e.kind !== 'A') return;
    switch (e.kind) {
      case 'A':
        this.skipping = false;
        this.closeOpen();
        this.cur = this.fresh(e.seq);
        if (e.cwd !== undefined) this.cur.cwd = e.cwd;
        return;
      case 'B':
        this.cur ??= this.fresh(null);
        if (this.cur.status === 'prompt') this.cur.status = 'input';
        return;
      case 'C': {
        const b = (this.cur ??= this.fresh(null));
        b.status = 'running';
        b.hasRun = true;
        b.startTs = e.ts;
        b.outputRange.start = e.outputOffset ?? null;
        if (e.cmdline !== undefined) {
          b.reportedCommand = e.cmdline;
          if (!b.recorded) b.command = e.cmdline;
        }
        return;
      }
      case 'D': {
        const b = (this.cur ??= this.fresh(null));
        b.hasRun = true;
        b.exitCode = typeof e.exit === 'number' ? e.exit : 'unknown';
        b.outputRange.end = e.outputOffset ?? null;
        b.durationMs = b.startTs === null ? 'unknown' : e.ts - b.startTs;
        b.status = 'finished';
        this.close(b);
        this.cur = null;
        return;
      }
    }
  }

  private fresh(promptSeq: number | null): Working {
    return {
      id: `blk-${++this.counter}`,
      trust: MARKER_TRUST_LABEL,
      promptSeq,
      command: 'unknown',
      reportedCommand: 'unknown',
      cwd: 'unknown',
      outputRange: { start: null, end: null },
      exitCode: 'unknown',
      durationMs: 'unknown',
      status: 'prompt',
      startTs: null,
      hasRun: false,
      recorded: false,
    };
  }

  private closeOpen(): void {
    const b = this.cur;
    if (b?.hasRun) {
      b.status = 'incomplete';
      this.close(b);
    }
    this.cur = null;
  }

  private close(b: Working): void {
    const { startTs: _s, hasRun: _h, recorded: _r, ...block } = b;
    void _s;
    void _h;
    void _r;
    this.done.push(block);
  }
}
