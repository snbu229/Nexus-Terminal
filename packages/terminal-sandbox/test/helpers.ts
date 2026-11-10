import type { TerminalProvider } from '../src/index.js';

/** Collects provider output and lets a test wait for a substring or for exit. */
export function collect(p: TerminalProvider) {
  let text = '';
  const waiters: Array<{ re: RegExp | string; resolve: () => void }> = [];
  const check = () => {
    for (const w of [...waiters]) {
      if (typeof w.re === 'string' ? text.includes(w.re) : w.re.test(text)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve();
      }
    }
  };
  let exitCode: number | undefined;
  let exitWaiters: Array<(c: number) => void> = [];
  p.onData((d) => {
    text += Buffer.from(d).toString('utf8');
    check();
  });
  p.onExit((c) => {
    exitCode = c;
    exitWaiters.forEach((r) => r(c));
    exitWaiters = [];
  });
  return {
    get text() {
      return text;
    },
    waitFor(re: RegExp | string, ms = 8000): Promise<void> {
      return new Promise((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error(`timeout waiting for ${String(re)}; got ${JSON.stringify(text)}`)),
          ms,
        );
        waiters.push({
          re,
          resolve: () => {
            clearTimeout(t);
            resolve();
          },
        });
        check();
      });
    },
    waitExit(ms = 8000): Promise<number> {
      if (exitCode !== undefined) return Promise.resolve(exitCode);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout waiting for exit')), ms);
        exitWaiters.push((c) => {
          clearTimeout(t);
          resolve(c);
        });
      });
    },
  };
}
