/** Submit encoding per BR-6: the exact bytes that go to the PTY for a confirmed draft. */

export type BracketedPaste = 'on' | 'off' | 'unknown';

export class EncodeError extends Error {}

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
// eslint-disable-next-line no-control-regex
const BAD_BYTES = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;

/**
 * Returns the frames to send, in order.
 * - single line: `draft\r`
 * - multiline, bracketed paste on: one frame `ESC[200~ draft ESC[201~ \r`
 * - multiline, off/unknown: one `line\r` frame per line; each needs its own user confirmation
 *   (the caller sends them one at a time). No `sh -c`, no quoting changes.
 * Any `ESC[201~` in the draft is removed first; any other control byte is refused.
 */
export function encodeSubmit(draft: string, paste: BracketedPaste): string[] {
  const text = draft.split(PASTE_END).join('');
  if (BAD_BYTES.test(text)) throw new EncodeError('draft contains control bytes');
  if (!text.includes('\n')) return [`${text}\r`];
  if (paste === 'on') return [`${PASTE_START}${text}${PASTE_END}\r`];
  return text.split('\n').map((line) => `${line}\r`);
}

/**
 * Whether Enter may submit: false while quotes, `$(`, backticks, a trailing backslash or a
 * here-document are open. Shell keywords (`if`, `do`) are left to the shell's own PS2.
 */
export function isComplete(text: string): boolean {
  let single = false;
  let double = false;
  let backtick = false;
  let paren = 0;
  const pending: { tag: string; strip: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (single) {
      if (c === "'") single = false;
      i++;
      continue;
    }
    if (c === '\\') {
      if (i + 1 >= text.length) return false;
      i += 2;
      continue;
    }
    if (c === '\n' && !double && !backtick && pending.length > 0) {
      // consume here-document bodies
      i++;
      while (pending.length > 0) {
        const hd = pending[0]!;
        let closed = false;
        while (i <= text.length && !closed) {
          const nl = text.indexOf('\n', i);
          const end = nl === -1 ? text.length : nl;
          let line = text.slice(i, end);
          if (hd.strip) line = line.replace(/^\t+/, '');
          const last = nl === -1;
          i = last ? text.length + 1 : nl + 1;
          if (line === hd.tag) closed = true;
          else if (last) break;
        }
        if (!closed) return false;
        pending.shift();
      }
      continue;
    }
    if (c === "'" && !double && !backtick) single = true;
    else if (c === '"') double = !double;
    else if (c === '`') backtick = !backtick;
    else if (c === '$' && text[i + 1] === '(') {
      paren++;
      i++;
    } else if (c === ')' && paren > 0) paren--;
    else if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<' && !double && !backtick) {
      const m = /^<<(-?)\s*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z0-9_]+))/.exec(text.slice(i));
      if (m) {
        pending.push({ tag: m[2] ?? m[3] ?? m[4] ?? '', strip: m[1] === '-' });
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  return !single && !double && !backtick && paren === 0 && pending.length === 0;
}
