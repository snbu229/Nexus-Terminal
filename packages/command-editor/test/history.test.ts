import { describe, expect, it } from 'vitest';
import { History } from '../src/index.js';

describe('History', () => {
  it('deduplicates, keeping the latest occurrence last', () => {
    const h = new History();
    ['ls', 'pwd', 'ls'].forEach((c) => h.push(c));
    expect(h.entries).toEqual(['pwd', 'ls']);
  });
  it('ignores empty and whitespace-only commands', () => {
    const h = new History();
    h.push('');
    h.push('  \n');
    expect(h.entries).toEqual([]);
  });
  it('up/down walk entries without destroying the current draft', () => {
    const h = new History();
    ['one', 'two', 'three'].forEach((c) => h.push(c));
    expect(h.previous('half-typed')).toBe('three');
    expect(h.previous('ignored')).toBe('two');
    expect(h.next()).toBe('three');
    expect(h.next()).toBe('half-typed');
    expect(h.next()).toBeNull();
  });
  it('previous stops at the oldest entry', () => {
    const h = new History();
    h.push('a');
    expect(h.previous('d')).toBe('a');
    expect(h.previous('d')).toBe('a');
  });
  it('prefix search narrows up/down to matching entries', () => {
    const h = new History();
    ['git status', 'ls', 'git diff', 'pwd'].forEach((c) => h.push(c));
    expect(h.search('git')).toEqual(['git diff', 'git status']);
    expect(h.previous('git', { prefix: true })).toBe('git diff');
    expect(h.previous('git', { prefix: true })).toBe('git status');
    expect(h.next()).toBe('git diff');
    expect(h.next()).toBe('git');
  });
  it('is per session: instances do not share entries', () => {
    const a = new History();
    const b = new History();
    a.push('secret-ish');
    expect(b.entries).toEqual([]);
  });
  it('bounds size, dropping the oldest', () => {
    const h = new History({ max: 3 });
    ['a', 'b', 'c', 'd'].forEach((c) => h.push(c));
    expect(h.entries).toEqual(['b', 'c', 'd']);
  });
  it('pushing resets navigation', () => {
    const h = new History();
    h.push('a');
    h.previous('x');
    h.push('b');
    expect(h.previous('y')).toBe('b');
  });
});
