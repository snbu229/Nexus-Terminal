import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  AgentEventSchema,
  AgentSessionSchema,
  ApprovalSchema,
  CreateTerminalSessionRequestSchema,
  HostSchema,
  TerminalClientFrameSchema,
  TerminalServerFrameSchema,
  TerminalSessionSchema,
  agentEventFixtures,
  agentSessionFixtures,
  approvalFixtures,
  hostFixtures,
  terminalSessionFixtures,
} from '../src/index.js';

const spec = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')) as {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  'x-websockets': Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
};

describe('fixtures validate against their schemas', () => {
  it.each(hostFixtures)('host $id', (h) => expect(HostSchema.parse(h)).toEqual(h));
  it.each(terminalSessionFixtures)('terminal session $id', (s) =>
    expect(TerminalSessionSchema.parse(s)).toEqual(s),
  );
  it.each(agentSessionFixtures)('agent session $id', (s) =>
    expect(AgentSessionSchema.parse(s)).toEqual(s),
  );
  it.each(agentEventFixtures)('agent event seq $seq ($kind)', (e) =>
    expect(AgentEventSchema.parse(e)).toEqual(e),
  );
  it.each(approvalFixtures)('approval $id', (a) => expect(ApprovalSchema.parse(a)).toEqual(a));
});

describe('fixture coverage', () => {
  it('has 6-8 hosts across linux/darwin and amd64/arm64 with mixed status', () => {
    expect(hostFixtures.length).toBeGreaterThanOrEqual(6);
    expect(hostFixtures.length).toBeLessThanOrEqual(8);
    const combos = new Set(hostFixtures.map((h) => `${h.os}/${h.arch}`));
    expect(combos).toEqual(new Set(['linux/amd64', 'linux/arm64', 'darwin/amd64', 'darwin/arm64']));
    expect(new Set(hostFixtures.map((h) => h.status)).size).toBe(3);
    expect(new Set(hostFixtures.map((h) => h.id)).size).toBe(hostFixtures.length);
  });
  it('has 2 agent sessions and 3 approvals', () => {
    expect(agentSessionFixtures).toHaveLength(2);
    expect(approvalFixtures).toHaveLength(3);
  });
});

describe('schema strictness', () => {
  it('rejects unknown host fields and non-dev environments', () => {
    expect(HostSchema.safeParse({ ...hostFixtures[0], address: '10.0.0.1' }).success).toBe(false);
    expect(HostSchema.safeParse({ ...hostFixtures[0], environment: 'prod' }).success).toBe(false);
  });
  it('approvals carry no decision field', () => {
    expect(ApprovalSchema.safeParse({ ...approvalFixtures[0], approved: true }).success).toBe(
      false,
    );
  });
  it('validates terminal frames', () => {
    expect(TerminalClientFrameSchema.safeParse({ type: 'input', data: 'ls\n' }).success).toBe(true);
    expect(
      TerminalClientFrameSchema.safeParse({ type: 'resize', cols: 80, rows: 24 }).success,
    ).toBe(true);
    expect(TerminalClientFrameSchema.safeParse({ type: 'resume', afterSeq: 5 }).success).toBe(true);
    expect(TerminalClientFrameSchema.safeParse({ type: 'resize', cols: 0, rows: 24 }).success).toBe(
      false,
    );
    expect(
      TerminalServerFrameSchema.safeParse({ type: 'output', seq: 1, data: 'bHMK' }).success,
    ).toBe(true);
    expect(
      TerminalServerFrameSchema.safeParse({ type: 'output', seq: 1, data: '!!notb64' }).success,
    ).toBe(false);
    expect(TerminalServerFrameSchema.safeParse({ type: 'state', state: 'running' }).success).toBe(
      true,
    );
    expect(TerminalServerFrameSchema.safeParse({ type: 'exit', code: 0 }).success).toBe(true);
  });
  it('validates create-session request', () => {
    expect(
      CreateTerminalSessionRequestSchema.safeParse({ hostId: 'h', cols: 80, rows: 24 }).success,
    ).toBe(true);
    expect(CreateTerminalSessionRequestSchema.safeParse({ hostId: 'h', cols: 80 }).success).toBe(
      false,
    );
  });
});

describe('openapi.yaml matches plan §4', () => {
  const expected = [
    'GET /healthz',
    'GET /readyz',
    'GET /hosts',
    'GET /hosts/{id}',
    'GET /terminal-sessions',
    'POST /terminal-sessions',
    'GET /terminal-sessions/{id}',
    'DELETE /terminal-sessions/{id}',
    'GET /agent-sessions',
    'GET /agent-sessions/{id}',
    'POST /agent-sessions',
    'POST /agent-sessions/{id}/stop',
    'GET /approvals',
  ].sort();

  it('is OpenAPI 3.1', () => expect(spec.openapi).toMatch(/^3\.1\./));
  it('lists exactly the §4 HTTP operations (no approve/deny)', () => {
    const actual = Object.entries(spec.paths)
      .flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`))
      .sort();
    expect(actual).toEqual(expected);
  });
  it('documents both WebSocket streams', () => {
    expect(Object.keys(spec['x-websockets']).sort()).toEqual([
      '/agent-sessions/{id}/events',
      '/terminal-sessions/{id}/stream',
    ]);
  });
  it('resolves every $ref', () => {
    const text = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
    const refs = [...text.matchAll(/\$ref: '#\/components\/(\w+)\/(\w+)'/g)];
    expect(refs.length).toBeGreaterThan(10);
    const components = spec.components as Record<string, Record<string, unknown>>;
    for (const [, kind, name] of refs) {
      expect(components[kind!]?.[name!], `${kind}/${name}`).toBeDefined();
    }
  });
});
