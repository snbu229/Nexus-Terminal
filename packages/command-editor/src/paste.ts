/** Safe paste (BR-5, TC-14): strip controls, normalise newlines, flag Trojan-Source class characters. */

export type FlagKind = 'bidi' | 'zero-width' | 'homoglyph';

export interface PasteFlag {
  kind: FlagKind;
  /** UTF-16 index into `text`. */
  index: number;
  codePoint: number;
}

export interface PasteResult {
  /** Safe text: no controls except \n and \t, no raw \r. Flagged characters are kept. */
  text: string;
  /** What was removed, for the review UI. */
  removed: string[];
  flags: PasteFlag[];
  /** Raw text with escapes and flagged characters made visible. */
  preview: string;
  /** A paste is never submitted by itself. */
  autoRun: false;
}

/* eslint-disable no-control-regex */
const ESC_SEQUENCES = new RegExp(
  [
    '\\u001b\\[[0-?]*[ -/]*[@-~]', // CSI
    '\\u001b\\][^\\u0007\\u001b]*(?:\\u0007|\\u001b\\\\)?', // OSC
    '\\u001b[PX^_][^\\u001b]*(?:\\u001b\\\\)?', // DCS/SOS/PM/APC
    '\\u001b[@-Z\\\\-_]', // two-byte
    '\\u001b', // lone ESC
  ].join('|'),
  'g',
);
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
/* eslint-enable no-control-regex */

const isBidi = (cp: number) => (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
const isZeroWidth = (cp: number) =>
  (cp >= 0x200b && cp <= 0x200f) || cp === 0x2060 || cp === 0xfeff;

const LATIN = /\p{Script=Latin}/u;
const CONFUSABLE = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

const hex = (cp: number) => `<U+${cp.toString(16).toUpperCase().padStart(4, '0')}>`;

export function sanitizePaste(raw: string): PasteResult {
  const normalised = raw.replace(/\r\n?/g, '\n');
  const removed: string[] = [];
  const text = normalised
    .replace(ESC_SEQUENCES, (m) => (removed.push(m), ''))
    .replace(CONTROLS, (m) => (removed.push(m), ''));

  const flags: PasteFlag[] = [];
  let i = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isBidi(cp)) flags.push({ kind: 'bidi', index: i, codePoint: cp });
    else if (isZeroWidth(cp)) flags.push({ kind: 'zero-width', index: i, codePoint: cp });
    i += ch.length;
  }
  // mixed-script tokens: Latin letters next to Cyrillic/Greek ones
  for (const m of text.matchAll(/\S+/g)) {
    const token = m[0];
    if (!LATIN.test(token) || !CONFUSABLE.test(token)) continue;
    let j = m.index;
    for (const ch of token) {
      if (CONFUSABLE.test(ch))
        flags.push({ kind: 'homoglyph', index: j, codePoint: ch.codePointAt(0)! });
      j += ch.length;
    }
  }
  flags.sort((a, b) => a.index - b.index);

  let preview = '';
  for (const ch of normalised) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x1b) preview += '<ESC>';
    else if (ch === '\n' || ch === '\t') preview += ch;
    else if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || isBidi(cp) || isZeroWidth(cp))
      preview += hex(cp);
    else preview += ch;
  }
  // homoglyphs: show them too, in the preview of the safe text positions
  if (flags.some((f) => f.kind === 'homoglyph')) {
    preview = preview
      .split('')
      .map((c) => (CONFUSABLE.test(c) ? hex(c.codePointAt(0)!) : c))
      .join('');
  }
  return { text, removed, flags, preview, autoRun: false };
}
