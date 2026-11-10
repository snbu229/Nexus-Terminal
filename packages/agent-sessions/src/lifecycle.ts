import type { AgentSession } from '@nexus/contracts';

/** Internal lifecycle. The public contract has a coarser state set, see toPublicState. */
export const LIFECYCLE_STATES = [
  'created',
  'starting',
  'running',
  'needs_input',
  'stopping',
  'exited',
  'failed',
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

const TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  created: ['starting', 'failed'],
  starting: ['running', 'stopping', 'failed'],
  running: ['needs_input', 'stopping', 'exited', 'failed'],
  needs_input: ['running', 'stopping', 'failed'],
  stopping: ['exited', 'failed'],
  exited: [],
  failed: [],
};

export class InvalidTransitionError extends Error {
  override readonly name = 'InvalidTransitionError';
  constructor(
    readonly from: LifecycleState,
    readonly to: LifecycleState,
  ) {
    super(`Invalid agent session transition ${from} -> ${to}`);
  }
}

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: LifecycleState, to: LifecycleState): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isTerminal(state: LifecycleState): boolean {
  return TRANSITIONS[state].length === 0;
}

/**
 * Maps the internal state to the contract v0 state. Lossy by design (contract change deferred):
 * stopping is still shown as running, a failed session is shown as exited (its exit code is non-zero),
 * and an exit that followed a stop request is shown as stopped.
 */
export function toPublicState(
  state: LifecycleState,
  exitReason: ExitReason | null,
): AgentSession['state'] {
  switch (state) {
    case 'created':
    case 'starting':
      return 'starting';
    case 'running':
    case 'stopping':
      return 'running';
    case 'needs_input':
      return 'needs_input';
    case 'exited':
      return exitReason === 'stopped' ? 'stopped' : 'exited';
    case 'failed':
      return 'exited';
  }
}

export type ExitReason = 'completed' | 'stopped' | 'error';
