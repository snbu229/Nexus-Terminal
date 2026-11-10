import { describe, expect, it } from 'vitest';
import {
  InvalidTransitionError,
  LIFECYCLE_STATES,
  assertTransition,
  canTransition,
  isTerminal,
  toPublicState,
} from '../src/lifecycle.js';

const ALLOWED: Record<string, string[]> = {
  created: ['starting', 'failed'],
  starting: ['running', 'stopping', 'failed'],
  running: ['needs_input', 'stopping', 'exited', 'failed'],
  needs_input: ['running', 'stopping', 'failed'],
  stopping: ['exited', 'failed'],
  exited: [],
  failed: [],
};

describe('lifecycle transitions', () => {
  for (const from of LIFECYCLE_STATES) {
    for (const to of LIFECYCLE_STATES) {
      const ok = ALLOWED[from]!.includes(to);
      it(`${from} -> ${to} is ${ok ? 'allowed' : 'rejected'}`, () => {
        expect(canTransition(from, to)).toBe(ok);
        if (ok) expect(() => assertTransition(from, to)).not.toThrow();
        else expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
      });
    }
  }

  it('only exited and failed are terminal', () => {
    expect(LIFECYCLE_STATES.filter(isTerminal)).toEqual(['exited', 'failed']);
  });

  it('maps to public states without hiding a stop or a failure as a clean exit', () => {
    expect(toPublicState('created', null)).toBe('starting');
    expect(toPublicState('stopping', null)).toBe('running');
    expect(toPublicState('exited', 'completed')).toBe('exited');
    expect(toPublicState('exited', 'stopped')).toBe('stopped');
    expect(toPublicState('failed', 'error')).toBe('exited');
  });
});
