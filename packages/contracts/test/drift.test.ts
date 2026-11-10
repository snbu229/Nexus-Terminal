import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import * as contracts from '../src/index.js';
import {
  MAX_AGENT_TEXT_CHARS,
  MAX_TERMINAL_INPUT_BYTES,
  agentEventFixtures,
  agentSessionFixtures,
  approvalFixtures,
  hostFixtures,
  terminalSessionFixtures,
  TerminalClientFrameSchema,
  AgentEventSchema,
} from '../src/index.js';

type Json = Record<string, unknown>;
const spec = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')) as {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  components: { schemas: Record<string, Json> };
};

/** zod schema name -> OpenAPI component name. */
const PAIRS: Record<string, string> = {
  HealthzSchema: 'Healthz',
  ReadyzSchema: 'Readyz',
  HostSchema: 'Host',
  HostResponseSchema: 'HostResponse',
  HostListResponseSchema: 'HostListResponse',
  TerminalSessionSchema: 'TerminalSession',
  CreateTerminalSessionRequestSchema: 'CreateTerminalSessionRequest',
  TerminalSessionResponseSchema: 'TerminalSessionResponse',
  TerminalSessionListResponseSchema: 'TerminalSessionListResponse',
  TerminalClientFrameSchema: 'TerminalClientFrame',
  TerminalServerFrameSchema: 'TerminalServerFrame',
  AgentSessionSchema: 'AgentSession',
  CreateAgentSessionRequestSchema: 'CreateAgentSessionRequest',
  AgentSessionResponseSchema: 'AgentSessionResponse',
  AgentSessionListResponseSchema: 'AgentSessionListResponse',
  AgentClientFrameSchema: 'AgentClientFrame',
  AgentEventSchema: 'AgentEvent',
  ApprovalSchema: 'Approval',
  ApprovalListResponseSchema: 'ApprovalListResponse',
  ErrorResponseSchema: 'ErrorResponse',
};

const sortKeys = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v as Json)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, sortKeys(x)]),
        )
      : v;

/**
 * Reduce a JSON Schema (zod-generated or hand-written OpenAPI) to the constraints that matter:
 * type, enum/const, numeric and length bounds, required, additionalProperties, nesting.
 * Resolves $ref against components, ignores description/format/pattern/$schema noise, and
 * treats `const`/single `enum` and `anyOf[T,null]` / `type:[T,null]` as the same thing.
 */
function norm(node: unknown, comps: Record<string, Json>): unknown {
  const n = node as Json;
  if (typeof n.$ref === 'string') return norm(comps[n.$ref.split('/').pop()!], comps);
  if (Array.isArray(n.anyOf) && n.anyOf.length === 2) {
    const types = n.anyOf.map((x: Json) => x.type);
    if (types.includes('null')) {
      const other = n.anyOf.find((x: Json) => x.type !== 'null') as Json;
      return norm({ ...other, type: [other.type, 'null'] }, comps);
    }
  }
  const out: Json = {};
  const alt = (n.oneOf ?? n.anyOf) as unknown[] | undefined;
  if (alt) {
    out.oneOf = alt
      .map((x) => norm(x, comps))
      .sort((a, b) => JSON.stringify(sortKeys(a)).localeCompare(JSON.stringify(sortKeys(b))));
    return out;
  }
  if ('const' in n) out.enum = [n.const];
  if (Array.isArray(n.enum)) out.enum = [...n.enum].sort();
  if (n.type !== undefined && out.enum === undefined)
    out.type = Array.isArray(n.type) ? [...n.type].sort() : n.type;
  for (const k of ['minLength', 'maxLength', 'minimum', 'maximum', 'contentEncoding']) {
    // zod adds safe-integer bounds to .int(); they are implied by `type: integer`.
    if (
      n[k] !== undefined &&
      !(typeof n[k] === 'number' && Math.abs(n[k] as number) === Number.MAX_SAFE_INTEGER)
    )
      out[k] = n[k];
  }
  if (n.properties) {
    out.properties = Object.fromEntries(
      Object.entries(n.properties as Json).map(([k, v]) => [k, norm(v, comps)]),
    );
    out.required = [...((n.required as string[] | undefined) ?? [])].sort();
    out.additionalProperties = n.additionalProperties === false ? false : true;
  }
  if (n.items) out.items = norm(n.items, comps);
  if (
    n.type === 'object' &&
    !n.properties &&
    n.additionalProperties &&
    n.additionalProperties !== true
  )
    out.values = norm(n.additionalProperties, comps);
  return sortKeys(out);
}

const specComps = spec.components.schemas;
const exportsByName = contracts as unknown as Record<string, z.ZodType>;

describe('OpenAPI components match zod schemas (schema-level drift)', () => {
  it('every exported contract schema is covered by the drift table or explicitly skipped', () => {
    const skipped = new Set([
      'HostOsSchema',
      'HostArchSchema',
      'HostStatusSchema',
      'TerminalProviderKindSchema',
      'TerminalSessionStateSchema',
      'AgentSessionStateSchema',
      'AgentSessionContinuitySchema',
      'ApprovalStatusSchema',
      'ApprovalRiskSchema',
    ]);
    const names = Object.keys(exportsByName).filter((k) => k.endsWith('Schema'));
    expect(names.filter((n) => !(n in PAIRS) && !skipped.has(n))).toEqual([]);
  });

  it.each(Object.entries(PAIRS))('%s <-> components.schemas.%s', (zodName, compName) => {
    const generated = z.toJSONSchema(exportsByName[zodName]!, {
      io: 'input',
      unrepresentable: 'any',
    });
    const generatedNorm = norm(generated, {});
    // zod emits $defs-free output for these (no recursion), so no component table is needed.
    expect(spec.components.schemas[compName], `missing component ${compName}`).toBeDefined();
    expect(norm(specComps[compName], specComps)).toEqual(generatedNorm);
  });
});

describe('every POST documents a 400 ErrorResponse', () => {
  const posts = Object.entries(spec.paths).filter(([, ops]) => ops.post);
  it('finds the three POST operations', () => expect(posts).toHaveLength(3));
  it.each(posts.map(([p]) => p))('POST %s', (p) => {
    const r = spec.paths[p]!.post!.responses['400'] as { $ref?: string };
    expect(r?.$ref).toBe('#/components/responses/BadRequest');
  });
});

describe('size limits (A2)', () => {
  it('rejects oversized terminal input and agent text', () => {
    const ok = 'a'.repeat(MAX_TERMINAL_INPUT_BYTES);
    expect(TerminalClientFrameSchema.safeParse({ type: 'input', data: ok }).success).toBe(true);
    expect(TerminalClientFrameSchema.safeParse({ type: 'input', data: ok + 'a' }).success).toBe(
      false,
    );
    const ev = { seq: 1, ts: '2026-11-10T09:00:00.000Z', kind: 'output' };
    expect(
      AgentEventSchema.safeParse({ ...ev, text: 'a'.repeat(MAX_AGENT_TEXT_CHARS + 1) }).success,
    ).toBe(false);
    expect(
      AgentEventSchema.safeParse({ ...ev, kind: 'needs_input', prompt: 'a'.repeat(2001) }).success,
    ).toBe(false);
  });
});

describe('fixtures', () => {
  const all = [
    hostFixtures,
    terminalSessionFixtures,
    agentSessionFixtures,
    ...Object.values(agentEventFixtures),
    approvalFixtures,
  ];
  it('are deeply frozen (A4)', () => {
    expect(Object.isFrozen(agentEventFixtures)).toBe(true);
    for (const list of all) {
      expect(Object.isFrozen(list)).toBe(true);
      for (const item of list) expect(Object.isFrozen(item)).toBe(true);
    }
    expect(Object.isFrozen(hostFixtures[0]!.tags)).toBe(true);
    expect(() => {
      (hostFixtures[0] as { name: string }).name = 'x';
    }).toThrow(TypeError);
  });
  it('are referentially consistent (A3)', () => {
    const hosts = new Set(hostFixtures.map((h) => h.id));
    const agents = new Set(agentSessionFixtures.map((a) => a.id));
    for (const t of terminalSessionFixtures) expect(hosts.has(t.hostId), t.id).toBe(true);
    for (const a of approvalFixtures) {
      if (a.hostId !== null) expect(hosts.has(a.hostId), a.id).toBe(true);
      if (a.agentSessionId !== null) expect(agents.has(a.agentSessionId), a.id).toBe(true);
    }
  });
  it('has one event list per agent session, contiguous from seq 1, ending at lastEventSeq', () => {
    expect(new Set(Object.keys(agentEventFixtures))).toEqual(
      new Set(agentSessionFixtures.map((a) => a.id)),
    );
    for (const a of agentSessionFixtures) {
      const events = agentEventFixtures[a.id] ?? [];
      expect(
        events.map((e) => e.seq),
        a.id,
      ).toEqual(events.map((_, i) => i + 1));
      expect(events.at(-1)?.seq ?? 0, a.id).toBe(a.lastEventSeq);
    }
  });
});
