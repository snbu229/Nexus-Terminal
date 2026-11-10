import { describe, expect, it } from 'vitest';
import { Draft } from '../src/index.js';

const draftOf = (text: string, caret = text.length) => {
  const d = new Draft();
  d.setText(text);
  d.moveTo(caret);
  return d;
};

describe('Draft editing (BR-1, BR-4)', () => {
  it('TC-01 model: click-to-place caret in a 300-char draft then insert at that index', () => {
    const text = 'a'.repeat(300);
    const d = draftOf(text);
    d.moveTo(150);
    d.insert('X');
    expect(d.text.indexOf('X')).toBe(150);
    expect(d.text).toHaveLength(301);
    expect(d.text).not.toContain('\n'); // soft wrap is visual only
  });
  it('clamps out-of-range clicks', () => {
    const d = draftOf('abc');
    d.moveTo(99);
    expect(d.caret).toBe(3);
    d.moveTo(-4);
    expect(d.caret).toBe(0);
  });
  it('typed control characters are refused (only \\n and \\t allowed)', () => {
    const d = new Draft();
    d.insert('a\x1b[31mb\x03\rc');
    expect(d.text).toBe('a[31mbc');
  });
  it('insert replaces the selection', () => {
    const d = draftOf('hello world');
    d.moveTo(0);
    d.moveTo(5, true);
    d.insert('HEY');
    expect(d.text).toBe('HEY world');
    expect(d.caret).toBe(3);
  });
  it('backspace/delete by char treat emoji as one unit', () => {
    const d = draftOf('a👍b');
    d.moveLeft();
    d.deleteBackward();
    expect(d.text).toBe('ab');
    const e = draftOf('a👍b', 1);
    e.deleteForward();
    expect(e.text).toBe('ab');
  });
  it('delete word / to line start / to line end', () => {
    const d = draftOf('foo bar baz');
    d.deleteWordBackward();
    expect(d.text).toBe('foo bar ');
    d.moveTo(0);
    d.deleteWordForward();
    expect(d.text).toBe(' bar ');
    const e = draftOf('one two\nthree four', 10);
    e.deleteToLineStart();
    expect(e.text).toBe('one two\nree four');
    e.deleteToLineEnd();
    expect(e.text).toBe('one two\n');
  });
});

describe('Draft navigation and selection (TC-02 model)', () => {
  it('Home/End/word movement on "foo bar baz"', () => {
    const d = draftOf('foo bar baz');
    d.moveLineStart();
    expect(d.caret).toBe(0);
    d.moveLineEnd();
    expect(d.caret).toBe(11);
    d.moveWordLeft();
    expect(d.caret).toBe(8);
    d.moveWordLeft();
    expect(d.caret).toBe(4);
    d.moveTo(0);
    d.moveWordRight();
    expect(d.caret).toBe(3);
  });
  it('double-click selects the word, triple-click the logical line not the visual row', () => {
    const d = draftOf('foo bar baz');
    d.selectWordAt(5);
    expect(d.selection).toEqual({ from: 4, to: 7 });
    const long = draftOf('x'.repeat(300));
    long.selectLineAt(250);
    expect(long.selection).toEqual({ from: 0, to: 300 });
    const ml = draftOf('ab\ncd');
    ml.selectLineAt(4);
    expect(ml.selection).toEqual({ from: 3, to: 5 });
  });
  it('select all, shift-extend, selectedText', () => {
    const d = draftOf('abc def');
    d.moveTo(0);
    d.moveWordRight(true);
    expect(d.selectedText).toBe('abc');
    d.selectAll();
    expect(d.selectedText).toBe('abc def');
  });
  it('multiline: up/down keep the column, report when at the edge', () => {
    const d = draftOf('abcd\nef\nghij', 3);
    expect(d.moveUp()).toBe(false); // first line: caller may go to history
    d.moveTo(11);
    expect(d.moveUp()).toBe(true);
    expect(d.caret).toBe(7); // clamped to end of "ef"
    expect(d.moveDown()).toBe(true);
    expect(d.caret).toBe(11); // remembered column 3
    d.moveTo(11);
    expect(d.moveDown()).toBe(false);
  });
  it('home/end are per logical line', () => {
    const d = draftOf('ab\ncd', 4);
    d.moveLineStart();
    expect(d.caret).toBe(3);
    d.moveLineEnd();
    expect(d.caret).toBe(5);
  });
});

describe('Draft multiline and undo/redo (BR-2, BR-3)', () => {
  it('newline() inserts \\n at the caret', () => {
    const d = draftOf('ab', 1);
    d.newline();
    expect(d.text).toBe('a\nb');
    expect(d.isMultiline).toBe(true);
  });
  it('TC-03 model: 20 edits, 20 undos -> empty, 20 redos -> restored', () => {
    const d = new Draft();
    for (let i = 0; i < 20; i++) {
      d.insert(String(i % 10));
      d.moveLineEnd(); // cursor move breaks typing coalescing
    }
    d.deleteBackward();
    d.insert('Z');
    const before = d.text;
    for (let i = 0; i < 25; i++) d.undo();
    expect(d.text).toBe('');
    for (let i = 0; i < 25; i++) d.redo();
    expect(d.text).toBe(before);
  });
  it('consecutive typing coalesces into one undo step', () => {
    const d = new Draft();
    d.insert('a');
    d.insert('b');
    d.insert('c');
    d.undo();
    expect(d.text).toBe('');
  });
  it('a new edit after undo drops the redo stack', () => {
    const d = new Draft();
    d.insert('a');
    d.moveLineEnd();
    d.insert('b');
    d.undo();
    d.insert('c');
    d.redo();
    expect(d.text).toBe('ac');
  });
  it('clear() is undoable and returns the draft to empty', () => {
    const d = draftOf('rm x');
    d.clear();
    expect(d.isEmpty).toBe(true);
    d.undo();
    expect(d.text).toBe('rm x');
  });
});
