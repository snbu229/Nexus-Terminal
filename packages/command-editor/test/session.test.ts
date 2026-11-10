import { describe, expect, it } from 'vitest';
import { Draft, EditorSession, type MarkerEvent } from '../src/index.js';

const ev = (kind: MarkerEvent['kind'], seq: number): MarkerEvent => ({ kind, seq, ts: seq });

/** A session sitting in INPUT after A(1) B(2). */
const inInput = () => {
  const s = new EditorSession();
  s.ingest(ev('A', 1));
  s.ingest(ev('B', 2));
  return s;
};

describe('state machine (spec §5)', () => {
  it('starts UNKNOWN with the editor off; A->B reaches INPUT', () => {
    const s = new EditorSession();
    expect(s.state).toBe('UNKNOWN');
    expect(s.captureAllowed).toBe(false);
    s.ingest(ev('A', 1));
    expect(s.state).toBe('PROMPT');
    expect(s.captureAllowed).toBe(false);
    s.ingest(ev('B', 2));
    expect(s.state).toBe('INPUT');
    expect(s.captureAllowed).toBe(true);
  });
  it('B without a preceding A stays UNKNOWN (TC-10)', () => {
    const s = new EditorSession();
    s.ingest(ev('B', 1));
    expect(s.state).toBe('UNKNOWN');
  });
  it('submit goes to PENDING immediately, C->RUNNING, D->PROMPT, B->INPUT', () => {
    const s = inInput();
    s.submit(new Draft());
    expect(s.state).toBe('PENDING');
    s.ingest(ev('C', 3));
    expect(s.state).toBe('RUNNING');
    s.ingest(ev('D', 4));
    s.ingest(ev('A', 5));
    s.ingest(ev('B', 6));
    expect(s.state).toBe('INPUT');
  });
  it('PENDING leaves to INPUT only on a B with seq > submit_seq, after an A (TC-10)', () => {
    const s = inInput();
    s.submit(new Draft()); // submit_seq = 2
    s.ingest(ev('B', 2)); // duplicate of the current prompt's B
    expect(s.state).toBe('PENDING');
    s.ingest(ev('A', 3));
    expect(s.state).toBe('PROMPT');
    s.ingest(ev('B', 4)); // A->B with no C/D (empty/comment-only submission)
    expect(s.state).toBe('INPUT');
  });
  it('a B straight after submit without a fresh A is ignored even if seq is higher', () => {
    const s = inInput();
    s.submit(new Draft());
    s.ingest(ev('B', 3));
    expect(s.state).toBe('PENDING');
  });
  it('a late C while PENDING advances to RUNNING', () => {
    const s = inInput();
    s.submit(new Draft());
    s.ingest(ev('C', 3));
    expect(s.state).toBe('RUNNING');
  });
  it('duplicate/reordered events are ignored; a gap drops to UNKNOWN and is recorded', () => {
    const s = inInput();
    s.ingest(ev('A', 2));
    expect(s.state).toBe('INPUT');
    s.ingest(ev('C', 5)); // 3,4 missing
    expect(s.state).toBe('UNKNOWN');
    expect(s.anomalies).toEqual(['reordered', 'gap']);
  });
  it('UNKNOWN recovers on the next A->B', () => {
    const s = inInput();
    s.ingest(ev('C', 9));
    s.ingest(ev('A', 10));
    s.ingest(ev('B', 11));
    expect(s.state).toBe('INPUT');
  });
});

describe('submit (BR-2, BR-6, BR-16)', () => {
  const draftOf = (t: string) => {
    const d = new Draft();
    d.setText(t);
    return d;
  };
  it('refuses outside INPUT / with the editor off', () => {
    const s = new EditorSession();
    expect(s.submit(draftOf('ls'))).toEqual({ ok: false, reason: 'not-in-input' });
  });
  it('Enter: single complete draft submits, framed per BR-6, bytes sent == frames', () => {
    const s = inInput();
    expect(s.pressEnter(draftOf('ls'))).toEqual({ action: 'submit' });
    const r = s.submit(draftOf('ls'));
    expect(r).toEqual({ ok: true, frames: ['ls\r'] });
    expect(s.latched).toBe(false); // framing of a confirmed draft never sets the latch
  });
  it('Enter on an incomplete draft inserts a newline instead of submitting', () => {
    const s = inInput();
    expect(s.pressEnter(draftOf('echo "a'))).toEqual({ action: 'newline' });
  });
  it('TC-05: Enter on a multiline draft sends nothing; Run (confirm) frames it', () => {
    const s = inInput();
    expect(s.pressEnter(draftOf('a\nb'))).toEqual({ action: 'needs-run' });
    expect(s.submit(draftOf('a\nb'))).toEqual({ ok: false, reason: 'needs-confirmation' });
    expect(s.state).toBe('INPUT');
    s.setBracketedPaste('on');
    const r = s.submit(draftOf('a\nb'), { confirmed: true });
    expect(r).toEqual({ ok: true, frames: ['\x1b[200~a\nb\x1b[201~\r'] });
    expect(s.state).toBe('PENDING');
  });
  it('multiline uses the supplied bracketed-paste capability', () => {
    const s = inInput();
    s.setBracketedPaste('off');
    expect(s.submit(draftOf('a\nb'), { confirmed: true })).toEqual({
      ok: true,
      frames: ['a\r', 'b\r'],
    });
  });
  it('bracketed paste observed after B inside a command (RUNNING) is never used (TC-25)', () => {
    const s = inInput();
    s.setBracketedPaste('off');
    s.submit(draftOf('sleep 1000'));
    s.ingest(ev('C', 3));
    s.setBracketedPaste('on'); // ignored: only INPUT-state reports count
    s.ingest(ev('D', 4));
    s.ingest(ev('A', 5));
    s.ingest(ev('B', 6));
    expect(s.submit(draftOf('a\nb'), { confirmed: true })).toEqual({
      ok: true,
      frames: ['a\r', 'b\r'],
    });
  });
  it('refuses to submit once the latch is set (no draft can exist)', () => {
    const s = inInput();
    s.sendRaw('x');
    expect(s.submit(draftOf('ls'))).toEqual({ ok: false, reason: 'not-in-input' });
  });
});

describe('BR-16 key routing', () => {
  it('INPUT: text goes to the draft, nothing reaches the PTY', () => {
    const s = inInput();
    expect(s.routeKey({ type: 'text', text: 'ls' }, new Draft())).toEqual({ target: 'draft' });
    expect(s.latched).toBe(false);
  });
  it('TC-26: INPUT + non-empty draft: Ctrl+C clears draft (no 0x03), Ctrl+D deletes char (no 0x04)', () => {
    const s = inInput();
    const d = new Draft();
    d.setText('echo hi');
    expect(s.routeKey({ type: 'ctrl-c' }, d)).toEqual({ target: 'draft', op: 'clear' });
    expect(s.routeKey({ type: 'ctrl-d' }, d)).toEqual({ target: 'draft', op: 'delete-forward' });
    expect(s.latched).toBe(false);
  });
  it('TC-26: INPUT + empty draft: raw 0x03/0x04 delivered and do NOT set the latch', () => {
    const s = inInput();
    expect(s.routeKey({ type: 'ctrl-c' }, new Draft())).toEqual({ target: 'pty', bytes: '\x03' });
    expect(s.routeKey({ type: 'ctrl-d' }, new Draft())).toEqual({
      target: 'pty',
      bytes: '\x04',
      confirm: true,
    });
    expect(s.latched).toBe(false);
    expect(s.captureAllowed).toBe(true);
  });
  it.each(['PENDING', 'RUNNING', 'UNKNOWN'] as const)(
    '%s: Ctrl+C/D/Z go raw and set the latch',
    (state) => {
      for (const [type, bytes] of [
        ['ctrl-c', '\x03'],
        ['ctrl-d', '\x04'],
        ['ctrl-z', '\x1a'],
      ] as const) {
        const s = inInput();
        if (state === 'PENDING') s.submit(new Draft());
        if (state === 'RUNNING') {
          s.submit(new Draft());
          s.ingest(ev('C', 3));
        }
        if (state === 'UNKNOWN') s.ingest(ev('C', 9));
        expect(s.state).toBe(state);
        expect(s.routeKey({ type }, new Draft())).toEqual({ target: 'pty', bytes });
        expect(s.latched).toBe(true);
      }
    },
  );
  it('TC-07b: keys typed right after Enter (PENDING, before C) are raw, never drafted', () => {
    const s = inInput();
    s.submit(new Draft());
    expect(s.routeKey({ type: 'text', text: 'S3cr3t' }, new Draft())).toEqual({
      target: 'pty',
      bytes: 'S3cr3t',
    });
    expect(s.captureAllowed).toBe(false);
  });
  it('B10: raw byte in PROMPT (between A and B) sets the latch', () => {
    const s = new EditorSession();
    s.ingest(ev('A', 1));
    s.routeKey({ type: 'text', text: 'x' }, new Draft());
    expect(s.latched).toBe(true);
  });
  it('B10: INTERACTIVE_PTY toggle in INPUT: raw byte sets latch; empty-draft 0x03 is NOT exempt there', () => {
    const s = inInput();
    s.setMode('INTERACTIVE_PTY');
    expect(s.captureAllowed).toBe(false);
    expect(s.routeKey({ type: 'ctrl-c' }, new Draft())).toEqual({ target: 'pty', bytes: '\x03' });
    expect(s.latched).toBe(true);
  });
  it('empty-draft 0x03 is exempt only when sent from SMART_INPUT (mouse-reporting mode counts as raw)', () => {
    const s = inInput();
    s.setMouseReporting(true);
    s.routeKey({ type: 'ctrl-d' }, new Draft());
    expect(s.latched).toBe(true);
  });
  it('sendRaw (paste to PTY, resize-free bytes, anything) sets the latch and returns the bytes', () => {
    const s = inInput();
    expect(s.sendRaw('abc')).toBe('abc');
    expect(s.latched).toBe(true);
  });
  it('the latch is never cleared: not by A/B/C/D, alt-screen exit, mode toggle, reset or reconnect', () => {
    const s = inInput();
    s.sendRaw('x');
    let n = 3;
    for (const k of ['D', 'A', 'B', 'C', 'D', 'A', 'B'] as const) s.ingest(ev(k, n++));
    s.setMode('INTERACTIVE_PTY');
    s.setMode('SMART_INPUT');
    s.setAltScreen(true);
    s.setAltScreen(false);
    s.resetPromptDetection();
    s.onReconnect();
    expect(s.latched).toBe(true);
    expect(s.captureAllowed).toBe(false);
    expect(s.routeKey({ type: 'ctrl-c' }, new Draft())).toEqual({ target: 'pty', bytes: '\x03' });
    expect(s.state === 'INPUT' || s.state === 'PROMPT').toBe(true); // markers still tracked
    expect(s.editorVisible).toBe(false);
    expect(s.latchNotice).toMatch(/new shell/i);
  });
  it('latch survives snapshot/restore (server-side session record)', () => {
    const s = inInput();
    s.sendRaw('x');
    const r = EditorSession.restore(s.snapshot());
    expect(r.latched).toBe(true);
    expect(r.captureAllowed).toBe(false);
  });
  it('restore keeps the marker state but never submits anything by itself (BR-11)', () => {
    const s = inInput();
    const r = EditorSession.restore(s.snapshot());
    expect(r.state).toBe('INPUT');
    expect(r.pendingFrames).toEqual([]);
  });
  it('captured text never reaches history unless submitted: session exposes no raw-key log', () => {
    const s = inInput();
    s.sendRaw('S3cr3t-CANARY');
    expect(JSON.stringify(s.snapshot())).not.toContain('CANARY');
  });
});

describe('mode switching (spec §6)', () => {
  it('alt-screen / mouse reporting enter INTERACTIVE_PTY and hide the editor without latching', () => {
    const s = inInput();
    s.setAltScreen(true);
    expect(s.mode).toBe('INTERACTIVE_PTY');
    expect(s.editorVisible).toBe(false);
    expect(s.latched).toBe(false);
  });
  it('TC-18: with no raw byte forwarded, alt-screen reset + next A/B or Reset prompt detection restores SMART_INPUT', () => {
    const s = inInput();
    s.setAltScreen(true);
    s.setAltScreen(false);
    s.ingest(ev('A', 3));
    s.ingest(ev('B', 4));
    expect(s.mode).toBe('SMART_INPUT');
    const t = inInput();
    t.setMode('INTERACTIVE_PTY');
    t.resetPromptDetection();
    expect(t.mode).toBe('SMART_INPUT');
  });
  it('TC-18 negative: a key typed in vim sets the latch; Reset leaves the editor off', () => {
    const s = inInput();
    s.setAltScreen(true);
    s.routeKey({ type: 'text', text: 'i' }, new Draft());
    s.setAltScreen(false);
    s.resetPromptDetection();
    expect(s.editorVisible).toBe(false);
    expect(s.latched).toBe(true);
  });
  it('the user toggle works in both directions while unlatched', () => {
    const s = inInput();
    s.toggleMode();
    expect(s.mode).toBe('INTERACTIVE_PTY');
    s.toggleMode();
    expect(s.mode).toBe('SMART_INPUT');
  });
});
