import { describe, expect, it } from 'vitest';
import { encodeSubmit, isComplete, EncodeError } from '../src/index.js';

const ESC = '\x1b';

describe('encodeSubmit (BR-6 byte-exact framing)', () => {
  it('single line: draft + \\r, never \\n', () => {
    expect(encodeSubmit('ls -l', 'on')).toEqual({ frame: 'ls -l\r', remainder: '' });
    expect(encodeSubmit('ls -l', 'off')).toEqual({ frame: 'ls -l\r', remainder: '' });
    expect(encodeSubmit('ls -l', 'unknown')).toEqual({ frame: 'ls -l\r', remainder: '' });
  });
  it('empty draft is a bare \\r', () => {
    expect(encodeSubmit('', 'on')).toEqual({ frame: '\r', remainder: '' });
  });
  it('multiline + bracketed paste on: ESC[200~ draft ESC[201~ \\r in one frame', () => {
    expect(encodeSubmit('a\nb', 'on')).toEqual({
      frame: `${ESC}[200~a\nb${ESC}[201~\r`,
      remainder: '',
    });
  });
  it('multiline + paste off/unknown: one \\r-terminated frame per line, no wrapper or quoting', () => {
    expect(encodeSubmit('a\nb "c"', 'off')).toEqual({ frame: 'a\r', remainder: 'b "c"' });
    expect(encodeSubmit('a\nb', 'unknown')).toEqual({ frame: 'a\r', remainder: 'b' });
  });
  it('removes any ESC[201~ from the draft before framing', () => {
    expect(encodeSubmit(`a${ESC}[201~b\nc`, 'on')).toEqual({
      frame: `${ESC}[200~ab\nc${ESC}[201~\r`,
      remainder: '',
    });
  });
  it('refuses drafts holding control bytes (would execute or escape)', () => {
    expect(() => encodeSubmit('a\rb', 'on')).toThrow(EncodeError);
    expect(() => encodeSubmit('a\x03b', 'on')).toThrow(EncodeError);
    expect(() => encodeSubmit(`a${ESC}[31mb`, 'on')).toThrow(EncodeError);
  });
  it('TAB is framed in bracketed paste only; otherwise refused (B3)', () => {
    expect(() => encodeSubmit('a\tb', 'off')).toThrow(EncodeError);
    expect(() => encodeSubmit('a\tb', 'unknown')).toThrow(EncodeError);
    expect(() => encodeSubmit('a\nb\tc', 'off')).toThrow(EncodeError);
  });
  it('frames tabs inside bracketed paste', () => {
    expect(encodeSubmit('a\tb', 'on')).toEqual({
      frame: `${ESC}[200~a\tb${ESC}[201~\r`,
      remainder: '',
    });
  });
});

describe('isComplete (Enter submits only a complete draft)', () => {
  it.each([
    ['ls', true],
    ['echo "hi', false],
    ["echo 'hi", false],
    ['echo "a\\"b"', true],
    ['echo hi \\', false],
    ['echo $(ls', false],
    ['echo $(ls)', true],
    ['echo `ls', false],
    ['if true; then', true], // keyword blocks are left to the shell (PS2)
    ['cat <<EOF\nhi', false],
    ['cat <<EOF\nhi\nEOF', true],
    ['cat <<-EOF\n\thi\n\tEOF', true],
    ["cat <<'EOF'\n$x\nEOF", true],
    ['', true],
  ])('%j -> %s', (t, ok) => {
    expect(isComplete(t)).toBe(ok);
  });
});
