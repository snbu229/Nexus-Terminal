import { describe, expect, it } from 'vitest';
import { Draft, sanitizePaste } from '../src/index.js';

describe('sanitizePaste (BR-5, TC-14)', () => {
  it('strips ESC sequences, NUL, C1 and a pasted ESC[201~', () => {
    const r = sanitizePaste('a\x1b[31mb\x00c\u009bd\x1b[201~e');
    // eslint-disable-next-line no-control-regex
    expect(r.text).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/);
    expect(r.text).not.toContain('201~');
    expect(r.removed.length).toBeGreaterThan(0);
  });
  it('never emits a raw \\r: CRLF and lone CR become \\n', () => {
    const r = sanitizePaste('a\r\nb\rc');
    expect(r.text).toBe('a\nb\nc');
    expect(r.text).not.toContain('\r');
  });
  it('keeps \\n and \\t', () => {
    expect(sanitizePaste('a\tb\nc').text).toBe('a\tb\nc');
  });
  it('flags (does not strip) bidi, zero-width and homoglyphs', () => {
    const r = sanitizePaste('a‮b⁦c​d');
    expect(r.text).toBe('a‮b⁦c​d');
    expect(r.flags.map((f) => f.kind)).toEqual(['bidi', 'bidi', 'zero-width']);
    expect(r.flags[0]).toMatchObject({ index: 1, codePoint: 0x202e });
    const h = sanitizePaste('ls аbc'); // Cyrillic a
    expect(h.flags.some((f) => f.kind === 'homoglyph')).toBe(true);
    expect(sanitizePaste('ls abc').flags).toEqual([]);
  });
  it('preview makes escapes and flagged characters visible', () => {
    const r = sanitizePaste('a‮b\x1b[2Jc');
    expect(r.preview).toContain('<U+202E>');
    expect(r.preview).toContain('<ESC>');
  });
  it('always requires review, never auto-run', () => {
    expect(sanitizePaste('ls\nrm -rf x').autoRun).toBe(false);
    expect(sanitizePaste('ls').autoRun).toBe(false);
  });
});

describe('Draft.paste', () => {
  it('multiline paste lands in the draft and is never submitted', () => {
    const d = new Draft();
    const r = d.paste('echo 1\r\necho 2\r\n');
    expect(d.text).toBe('echo 1\necho 2\n');
    expect(r.autoRun).toBe(false);
    d.undo();
    expect(d.text).toBe('');
  });
});
