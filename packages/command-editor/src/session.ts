/**
 * Mode state machine and input routing for one shell session (spec §5, §6, BR-16).
 *
 * Invariants:
 * - Draft capture exists only in INPUT, in SMART_INPUT, with the BR-16 latch clear.
 * - The typed-ahead latch is set by ANY byte that reaches the PTY other than the BR-6 framing of a
 *   confirmed draft. The only exception is the empty-draft 0x03/0x04 sent from SMART_INPUT (TC-26).
 * - Nothing clears the latch for the life of the session: no marker, mode change, reset, reconnect
 *   or snapshot/restore. A new shell session means a new EditorSession.
 */
import { BlockBuilder, type CommandBlock, type MarkerEvent } from './blocks.js';
import type { Draft } from './draft.js';
import {
  EncodeError,
  encodeSubmit,
  isComplete,
  type BracketedPaste,
  type Encoded,
} from './encode.js';

export type ShellState = 'UNKNOWN' | 'PROMPT' | 'INPUT' | 'PENDING' | 'RUNNING';
export type EditorMode = 'SMART_INPUT' | 'INTERACTIVE_PTY';
export type Anomaly = 'reordered' | 'gap';

export type KeyInput =
  { type: 'text'; text: string } | { type: 'ctrl-c' } | { type: 'ctrl-d' } | { type: 'ctrl-z' };

export type RouteResult =
  | { target: 'draft' }
  | { target: 'draft'; op: 'clear' | 'delete-forward' }
  | { target: 'pty'; bytes: string; confirm?: true }
  | { target: 'none' };

export type EnterResult = { action: 'submit' } | { action: 'newline' } | { action: 'needs-run' };

export type SubmitResult =
  | { ok: true; frame: string; remainder: string }
  | { ok: false; reason: 'not-in-input' | 'needs-confirmation' | 'incomplete' | 'invalid-bytes' };

export interface SessionSnapshot {
  state: ShellState;
  latched: boolean;
  /** null = no event seen yet (JSON-safe; never -Infinity). */
  lastSeq: number | null;
  submitSeq: number | null;
  bracketedPaste: BracketedPaste;
}

export const LATCH_NOTICE =
  'Smart editor is off for this shell because keys were sent straight to the shell. Open a new shell (tab) to turn it back on.';

const RAW_KEY_BYTES = { 'ctrl-c': '\x03', 'ctrl-d': '\x04', 'ctrl-z': '\x1a' } as const;

export class EditorSession {
  private st: ShellState = 'UNKNOWN';
  private latch = false;
  private last: number | null = null;
  private submitSeq: number | null = null;
  private prev: MarkerEvent['kind'] | null = null;
  private paste: BracketedPaste = 'unknown';
  private override: EditorMode | null = null;
  private altScreen = false;
  private mouse = false;
  private awaitingMarker = false;
  private readonly builder = new BlockBuilder();
  readonly anomalies: Anomaly[] = [];

  get state(): ShellState {
    return this.st;
  }
  get latched(): boolean {
    return this.latch;
  }
  get latchNotice(): string | null {
    return this.latch ? LATCH_NOTICE : null;
  }
  get mode(): EditorMode {
    if (this.override) return this.override;
    return this.altScreen || this.mouse || this.awaitingMarker ? 'INTERACTIVE_PTY' : 'SMART_INPUT';
  }
  /** Keystrokes may be captured into the draft right now. */
  get captureAllowed(): boolean {
    return !this.latch && this.mode === 'SMART_INPUT' && this.st === 'INPUT';
  }
  get editorVisible(): boolean {
    return !this.latch && this.mode === 'SMART_INPUT';
  }
  get blocks(): readonly CommandBlock[] {
    return this.builder.blocks;
  }
  get currentBlock(): Readonly<CommandBlock> | null {
    return this.builder.current;
  }

  // ---- markers ----

  /** Fail closed: unknown state, no grouping for the open block, capability forgotten. */
  private toUnknown(anomaly: Anomaly): void {
    this.anomalies.push(anomaly);
    this.st = 'UNKNOWN';
    this.prev = null;
    this.paste = 'unknown';
    this.builder.abandon();
  }

  ingest(e: MarkerEvent): void {
    if (this.last !== null && e.seq <= this.last) {
      this.toUnknown('reordered'); // duplicate or out-of-order (spec §5)
      return;
    }
    const gap = this.last !== null && e.seq !== this.last + 1;
    this.last = e.seq;
    if (gap) {
      this.toUnknown('gap');
      if (e.kind !== 'A') return;
    }
    const before = this.prev;
    this.prev = e.kind;
    switch (e.kind) {
      case 'A':
        this.builder.ingest(e);
        this.paste = 'unknown'; // BR-6: reset at each A
        this.st = 'PROMPT';
        break;
      case 'B':
        // BR-12(e): B is accepted only immediately after an A, in order; any other B is UNKNOWN
        if (before === 'A' && this.st === 'PROMPT' && this.last > (this.submitSeq ?? -1)) {
          this.builder.ingest(e);
          this.st = 'INPUT';
          this.awaitingMarker = false;
        } else {
          this.toUnknown('reordered');
        }
        break;
      case 'C':
        this.builder.ingest(e);
        this.st = 'RUNNING';
        break;
      case 'D':
        this.builder.ingest(e);
        this.st = 'PROMPT';
        break;
    }
  }

  /** Bracketed-paste capability reported at B. Reports outside INPUT (e.g. from a running command) are ignored (TC-25). */
  setBracketedPaste(v: BracketedPaste): void {
    if (this.st === 'INPUT') this.paste = v;
  }

  // ---- modes ----

  setAltScreen(on: boolean): void {
    if (on) this.altScreen = true;
    else if (this.altScreen) {
      this.altScreen = false;
      this.awaitingMarker = true; // back to SMART only on the next B
    }
  }
  setMouseReporting(on: boolean): void {
    if (on) this.mouse = true;
    else if (this.mouse) {
      this.mouse = false;
      this.awaitingMarker = true;
    }
  }
  /** User toggle. Does not touch the latch. */
  setMode(m: EditorMode): void {
    if (m === 'INTERACTIVE_PTY') this.override = 'INTERACTIVE_PTY';
    else this.clearModeFlags();
  }
  toggleMode(): void {
    this.setMode(this.mode === 'SMART_INPUT' ? 'INTERACTIVE_PTY' : 'SMART_INPUT');
  }
  /** "Reset prompt detection": mode goes back to SMART_INPUT; the latch is untouched. */
  resetPromptDetection(): void {
    this.clearModeFlags();
  }
  /** Reconnect/reload/reattach: the latch and state live with the session and are not reset. */
  onReconnect(): void {}

  private clearModeFlags(): void {
    this.override = null;
    this.altScreen = false;
    this.mouse = false;
    this.awaitingMarker = false;
  }

  // ---- input routing (BR-16) ----

  routeKey(key: KeyInput, draft: Draft): RouteResult {
    if (this.captureAllowed) {
      switch (key.type) {
        case 'text':
          return { target: 'draft' };
        case 'ctrl-c':
          // empty draft: raw 0x03, the one exception that does not set the latch
          return draft.isEmpty
            ? { target: 'pty', bytes: '\x03' }
            : { target: 'draft', op: 'clear' };
        case 'ctrl-d':
          return draft.isEmpty
            ? { target: 'pty', bytes: '\x04', confirm: true }
            : { target: 'draft', op: 'delete-forward' };
        case 'ctrl-z':
          return { target: 'none' };
      }
    }
    const bytes = key.type === 'text' ? key.text : RAW_KEY_BYTES[key.type];
    return { target: 'pty', bytes: this.sendRaw(bytes) };
  }

  /** Any bytes forwarded to the PTY that are not draft framing. Sets the latch; returns the bytes unchanged. */
  sendRaw(bytes: string): string {
    if (bytes.length > 0) this.latch = true;
    return bytes;
  }

  // ---- submission ----

  /** What Enter should do for this draft. Sends nothing. */
  pressEnter(draft: Draft): EnterResult {
    if (!isComplete(draft.text)) return { action: 'newline' };
    if (draft.isMultiline) return { action: 'needs-run' };
    return { action: 'submit' };
  }

  /** Confirm a draft: returns the BR-6 frames and moves to PENDING at once (no waiting for C). */
  submit(draft: Draft, opts: { confirmed?: boolean } = {}): SubmitResult {
    if (!this.captureAllowed) return { ok: false, reason: 'not-in-input' };
    if (draft.isMultiline && !opts.confirmed) return { ok: false, reason: 'needs-confirmation' };
    if (!isComplete(draft.text)) return { ok: false, reason: 'incomplete' };
    let enc: Encoded;
    try {
      enc = encodeSubmit(draft.text, this.paste);
    } catch (e) {
      if (e instanceof EncodeError) return { ok: false, reason: 'invalid-bytes' };
      throw e;
    }
    this.builder.recordCommand(
      enc.remainder ? draft.text.slice(0, -enc.remainder.length - 1) : draft.text,
    );
    this.submitSeq = this.last;
    this.st = 'PENDING';
    return { ok: true, frame: enc.frame, remainder: enc.remainder };
  }

  // ---- persistence (server-side session record; holds no keystrokes or draft text) ----

  snapshot(): SessionSnapshot {
    return {
      state: this.st,
      latched: this.latch,
      lastSeq: this.last,
      submitSeq: this.submitSeq,
      bracketedPaste: this.paste,
    };
  }

  static restore(s: SessionSnapshot): EditorSession {
    const e = new EditorSession();
    e.st = s.state;
    e.latch = s.latched;
    e.last = s.lastSeq;
    e.submitSeq = s.submitSeq;
    e.paste = s.bracketedPaste;
    return e;
  }
}
