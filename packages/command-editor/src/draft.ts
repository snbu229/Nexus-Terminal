/** Draft model: the editable command text before submission (BR-1..BR-4). Framework-free. */
import { sanitizePaste, type PasteResult } from './paste.js';

export interface Selection {
  from: number;
  to: number;
}

interface Snapshot {
  text: string;
  anchor: number;
  head: number;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const WORD = /[\p{L}\p{N}_]/u;

/** Grapheme boundaries of `text` as UTF-16 indexes, always including 0 and text.length. */
const boundaries = (text: string): number[] => {
  const out = [0];
  for (const seg of segmenter.segment(text)) out.push(seg.index + seg.segment.length);
  return out;
};

const isWordGrapheme = (text: string, from: number, to: number) => WORD.test(text.slice(from, to));

/** Characters a typed key may add to a draft: everything except C0/C1 controls and DEL, plus \n and \t. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_TYPED = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

export class Draft {
  private snap: Snapshot = { text: '', anchor: 0, head: 0 };
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private typing = false;
  private desiredColumn: number | null = null;

  get text(): string {
    return this.snap.text;
  }
  get caret(): number {
    return this.snap.head;
  }
  /** Current selection, or null when the caret is collapsed. */
  get selection(): Selection | null {
    const { anchor, head } = this.snap;
    return anchor === head ? null : { from: Math.min(anchor, head), to: Math.max(anchor, head) };
  }
  get selectedText(): string {
    const sel = this.selection;
    return sel ? this.snap.text.slice(sel.from, sel.to) : '';
  }
  get isEmpty(): boolean {
    return this.snap.text.length === 0;
  }
  get isMultiline(): boolean {
    return this.snap.text.includes('\n');
  }

  // ---- movement (never recorded for undo, never touches the PTY) ----

  moveTo(index: number, extend = false): void {
    this.setHead(this.clamp(index), extend);
  }
  moveLeft(extend = false): void {
    const sel = this.selection;
    if (sel && !extend) return this.setHead(sel.from, false);
    this.setHead(this.step(-1), extend);
  }
  moveRight(extend = false): void {
    const sel = this.selection;
    if (sel && !extend) return this.setHead(sel.to, false);
    this.setHead(this.step(1), extend);
  }
  moveWordLeft(extend = false): void {
    this.setHead(this.wordLeft(this.snap.head), extend);
  }
  moveWordRight(extend = false): void {
    this.setHead(this.wordRight(this.snap.head), extend);
  }
  /** Home: start of the logical line. */
  moveLineStart(extend = false): void {
    this.setHead(this.lineStart(this.snap.head), extend);
  }
  /** End: end of the logical line. */
  moveLineEnd(extend = false): void {
    this.setHead(this.lineEnd(this.snap.head), extend);
  }
  moveDocStart(extend = false): void {
    this.setHead(0, extend);
  }
  moveDocEnd(extend = false): void {
    this.setHead(this.snap.text.length, extend);
  }
  /** Returns false when already on the first line (caller may then walk history). */
  moveUp(extend = false): boolean {
    return this.moveVertical(-1, extend);
  }
  /** Returns false when already on the last line. */
  moveDown(extend = false): boolean {
    return this.moveVertical(1, extend);
  }

  // ---- selection ----

  selectAll(): void {
    this.snap = { ...this.snap, anchor: 0, head: this.snap.text.length };
    this.endRun();
  }
  /** Double-click: the word (or run of non-word characters) around `index`. */
  selectWordAt(index: number): void {
    const { text } = this.snap;
    if (text.length === 0) return;
    const b = boundaries(text);
    const i = Math.min(this.clamp(index), text.length - 1);
    const k = b.findIndex((x, n) => x <= i && (b[n + 1] ?? Infinity) > i);
    const cls = isWordGrapheme(text, b[k]!, b[k + 1]!);
    let lo = k;
    let hi = k + 1;
    while (lo > 0 && isWordGrapheme(text, b[lo - 1]!, b[lo]!) === cls && text[b[lo - 1]!] !== '\n')
      lo--;
    while (
      hi < b.length - 1 &&
      isWordGrapheme(text, b[hi]!, b[hi + 1]!) === cls &&
      text[b[hi]!] !== '\n'
    )
      hi++;
    this.snap = { ...this.snap, anchor: b[lo]!, head: b[hi]! };
    this.endRun();
  }
  /** Triple-click: the whole logical line (not the visual row) around `index`. */
  selectLineAt(index: number): void {
    const i = this.clamp(index);
    this.snap = { ...this.snap, anchor: this.lineStart(i), head: this.lineEnd(i) };
    this.endRun();
  }

  // ---- edits ----

  /** Typed text. Control characters other than \n and \t are dropped. */
  insert(text: string): void {
    const clean = text.replace(FORBIDDEN_TYPED, '');
    if (clean.length === 0) return;
    this.replaceSelection(clean, clean.length === 1 && clean !== '\n');
  }
  /** Shift+Enter, or Enter on an incomplete draft. */
  newline(): void {
    this.replaceSelection('\n', false);
  }
  /** Insert already-sanitised text (see sanitizePaste) as one undo step. */
  insertSanitized(text: string): void {
    if (text.length > 0) this.replaceSelection(text, false);
  }
  /** Sanitise a paste and insert it. Never submits. */
  paste(raw: string): PasteResult {
    const result = sanitizePaste(raw);
    this.insertSanitized(result.text);
    return result;
  }
  deleteBackward(): void {
    const sel = this.selection;
    if (sel) return this.remove(sel.from, sel.to);
    const from = this.step(-1);
    if (from !== this.snap.head) this.remove(from, this.snap.head);
  }
  deleteForward(): void {
    const sel = this.selection;
    if (sel) return this.remove(sel.from, sel.to);
    const to = this.step(1);
    if (to !== this.snap.head) this.remove(this.snap.head, to);
  }
  deleteWordBackward(): void {
    const sel = this.selection;
    if (sel) return this.remove(sel.from, sel.to);
    const from = this.wordLeft(this.snap.head);
    if (from !== this.snap.head) this.remove(from, this.snap.head);
  }
  deleteWordForward(): void {
    const sel = this.selection;
    if (sel) return this.remove(sel.from, sel.to);
    const to = this.wordRight(this.snap.head);
    if (to !== this.snap.head) this.remove(this.snap.head, to);
  }
  deleteToLineStart(): void {
    const from = this.lineStart(this.snap.head);
    if (from !== this.snap.head) this.remove(from, this.snap.head);
  }
  deleteToLineEnd(): void {
    const to = this.lineEnd(this.snap.head);
    if (to !== this.snap.head) this.remove(this.snap.head, to);
  }
  /** Ctrl+C in INPUT with a non-empty draft. Undoable. */
  clear(): void {
    if (this.snap.text.length > 0) this.remove(0, this.snap.text.length);
  }
  /** Replace the whole draft (Edit as draft, history recall, restore after reconnect). Undoable. */
  setText(text: string): void {
    const clean = text.replace(FORBIDDEN_TYPED, '');
    this.record(false);
    this.snap = { text: clean, anchor: clean.length, head: clean.length };
  }

  // ---- undo / redo (draft-local, BR-3) ----

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.snap);
    this.snap = prev;
    this.endRun();
  }
  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snap);
    this.snap = next;
    this.endRun();
  }

  // ---- internals ----

  private clamp(i: number): number {
    return Math.max(0, Math.min(i, this.snap.text.length));
  }
  private endRun(): void {
    this.typing = false;
    this.desiredColumn = null;
  }
  private setHead(head: number, extend: boolean): void {
    this.snap = { ...this.snap, head, anchor: extend ? this.snap.anchor : head };
    this.endRun();
  }
  private record(coalesce: boolean): void {
    if (!(coalesce && this.typing)) this.undoStack.push(this.snap);
    this.redoStack = [];
    this.typing = coalesce;
    this.desiredColumn = null;
  }
  private replaceSelection(text: string, coalesce: boolean): void {
    const sel = this.selection ?? { from: this.snap.head, to: this.snap.head };
    this.record(coalesce && this.selection === null);
    const { text: t } = this.snap;
    const next = t.slice(0, sel.from) + text + t.slice(sel.to);
    const caret = sel.from + text.length;
    this.snap = { text: next, anchor: caret, head: caret };
  }
  private remove(from: number, to: number): void {
    this.record(false);
    const { text } = this.snap;
    this.snap = { text: text.slice(0, from) + text.slice(to), anchor: from, head: from };
  }
  /** One grapheme left (-1) or right (1) of the caret. */
  private step(dir: -1 | 1): number {
    const { text, head } = this.snap;
    const b = boundaries(text);
    if (dir === -1) return [...b].reverse().find((x) => x < head) ?? 0;
    return b.find((x) => x > head) ?? text.length;
  }
  private wordLeft(from: number): number {
    const { text } = this.snap;
    const b = boundaries(text);
    let k = b.lastIndexOf(from);
    if (k < 0) k = b.findLastIndex((x) => x <= from);
    while (k > 0 && !isWordGrapheme(text, b[k - 1]!, b[k]!)) k--;
    while (k > 0 && isWordGrapheme(text, b[k - 1]!, b[k]!)) k--;
    return b[k]!;
  }
  private wordRight(from: number): number {
    const { text } = this.snap;
    const b = boundaries(text);
    let k = b.findIndex((x) => x >= from);
    while (k < b.length - 1 && !isWordGrapheme(text, b[k]!, b[k + 1]!)) k++;
    while (k < b.length - 1 && isWordGrapheme(text, b[k]!, b[k + 1]!)) k++;
    return b[k]!;
  }
  private lineStart(i: number): number {
    return this.snap.text.lastIndexOf('\n', i - 1) + 1;
  }
  private lineEnd(i: number): number {
    const n = this.snap.text.indexOf('\n', i);
    return n === -1 ? this.snap.text.length : n;
  }
  private moveVertical(dir: -1 | 1, extend: boolean): boolean {
    const { text, head } = this.snap;
    const start = this.lineStart(head);
    const col = this.desiredColumn ?? head - start;
    let target: number;
    if (dir === -1) {
      if (start === 0) return false;
      const prevStart = this.lineStart(start - 1);
      target = Math.min(prevStart + col, start - 1);
    } else {
      const end = this.lineEnd(head);
      if (end === text.length) return false;
      const nextStart = end + 1;
      target = Math.min(nextStart + col, this.lineEnd(nextStart));
    }
    const b = boundaries(text);
    const snapped = [...b].reverse().find((x) => x <= target) ?? 0;
    this.snap = { ...this.snap, head: snapped, anchor: extend ? this.snap.anchor : snapped };
    this.typing = false;
    this.desiredColumn = col;
    return true;
  }
}
