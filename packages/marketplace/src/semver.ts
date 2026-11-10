// Minimal semver: exact versions plus ranges made of space-separated comparators
// (>=, >, <=, <, =), caret, tilde and `*`. Pre-release tags are accepted but compare lower.
import { MarketplaceError } from './errors.ts';

export type Semver = { major: number; minor: number; patch: number; pre: string | null };

const VERSION_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

export function isSemver(v: string): boolean {
  return VERSION_RE.test(v);
}

export function parseSemver(v: string): Semver {
  const m = VERSION_RE.exec(v);
  if (!m) throw new MarketplaceError('invalid_manifest', `invalid semver: ${v}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ?? null };
}

export function compareSemver(a: Semver, b: Semver): number {
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return a.pre < b.pre ? -1 : 1;
}

type Comparator = { op: '>=' | '>' | '<=' | '<' | '='; v: Semver };

const PARTIAL_RE = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;

function expand(token: string): Comparator[] | null {
  if (token === '*' || token === 'x') return [];
  const op = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(token);
  if (!op) return null;
  const prefix = op[1] ?? '=';
  const rest = op[2] ?? '';
  const partial = PARTIAL_RE.exec(rest);
  if (!partial && !isSemver(rest)) return null;
  const full = partial
    ? {
        major: Number(partial[1]),
        minor: Number(partial[2] ?? 0),
        patch: Number(partial[3] ?? 0),
        pre: null,
      }
    : parseSemver(rest);
  if (prefix === '^') {
    const upper =
      full.major > 0
        ? { major: full.major + 1, minor: 0, patch: 0, pre: null }
        : full.minor > 0
          ? { major: 0, minor: full.minor + 1, patch: 0, pre: null }
          : { major: 0, minor: 0, patch: full.patch + 1, pre: null };
    return [
      { op: '>=', v: full },
      { op: '<', v: upper },
    ];
  }
  if (prefix === '~') {
    return [
      { op: '>=', v: full },
      { op: '<', v: { major: full.major, minor: full.minor + 1, patch: 0, pre: null } },
    ];
  }
  return [{ op: prefix as Comparator['op'], v: full }];
}

export function isValidRange(range: string): boolean {
  const tokens = range.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => expand(t) !== null);
}

export function satisfies(version: string, range: string): boolean {
  const v = parseSemver(version);
  const tokens = range.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  for (const t of tokens) {
    const cmps = expand(t);
    if (cmps === null) return false;
    for (const c of cmps) {
      const r = compareSemver(v, c.v);
      const ok =
        c.op === '>='
          ? r >= 0
          : c.op === '>'
            ? r > 0
            : c.op === '<='
              ? r <= 0
              : c.op === '<'
                ? r < 0
                : r === 0;
      if (!ok) return false;
    }
  }
  return true;
}
