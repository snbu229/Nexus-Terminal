import type { ReactNode } from 'react';
import { ApiError } from '../api/client';

export type Tone = 'ok' | 'warn' | 'danger' | 'muted';
const ICON: Record<Tone, string> = { ok: '●', warn: '▲', danger: '✕', muted: '○' };

/** Icon + text, never colour alone (WCAG 1.4.1). */
export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`pill pill-${tone}`}>
      <span aria-hidden="true">{ICON[tone]}</span> {label}
    </span>
  );
}

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong.';
}

interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** Loading, error and empty states shared by every list/detail view. */
export function QueryState<T>({
  query,
  what,
  isEmpty,
  emptyText,
  children,
}: {
  query: QueryLike<T>;
  what: string;
  isEmpty?: (d: T) => boolean;
  emptyText?: string;
  children: (d: T) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <p role="status" className="state">
        Loading {what}…
      </p>
    );
  }
  if (query.isError || query.data === undefined) {
    return (
      <div role="alert" className="state state-error">
        <p>
          Could not load {what}. {errorMessage(query.error)}
        </p>
        <button type="button" onClick={() => void query.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  if (isEmpty?.(query.data)) {
    return <p className="state">{emptyText ?? `No ${what}.`}</p>;
  }
  return <>{children(query.data)}</>;
}

export function formatTime(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');
}
