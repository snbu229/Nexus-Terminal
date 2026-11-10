import { z } from 'zod';

// API contract v0 (dev only), see plan §4 on EZF-43. Contract changes must be flagged on the issue.

export const API_PREFIX = '/api/v0';

const id = z.string().min(1).max(64);
const timestamp = z.iso.datetime();

// --- health ---------------------------------------------------------------
export const HealthzSchema = z.object({ status: z.literal('ok'), dev: z.literal(true) }).strict();
export const ReadyzSchema = z
  .object({
    status: z.enum(['ready', 'not_ready']),
    dev: z.literal(true),
    checks: z.record(z.string(), z.enum(['ok', 'fail'])),
  })
  .strict();

// --- hosts ----------------------------------------------------------------
export const HostOsSchema = z.enum(['linux', 'darwin']);
export const HostArchSchema = z.enum(['amd64', 'arm64']);
export const HostStatusSchema = z.enum(['online', 'offline', 'unknown']);
export const TerminalProviderKindSchema = z.enum(['local-sandbox', 'ssh-dev', 'none']);

export const HostSchema = z
  .object({
    id,
    name: z.string().min(1).max(128),
    os: HostOsSchema,
    arch: HostArchSchema,
    environment: z.literal('dev'),
    status: HostStatusSchema,
    tags: z.array(z.string().min(1).max(64)),
    terminalProvider: TerminalProviderKindSchema,
  })
  .strict();

export const HostResponseSchema = z.object({ dev: z.literal(true), host: HostSchema }).strict();
export const HostListResponseSchema = z
  .object({ dev: z.literal(true), hosts: z.array(HostSchema) })
  .strict();

// --- terminal sessions ----------------------------------------------------
export const TerminalSessionStateSchema = z.enum(['starting', 'running', 'exited']);

export const TerminalSessionSchema = z
  .object({
    id,
    hostId: id,
    state: TerminalSessionStateSchema,
    createdAt: timestamp,
    title: z.string().max(256),
  })
  .strict();

export const CreateTerminalSessionRequestSchema = z
  .object({
    hostId: id,
    cols: z.number().int().min(1).max(1000),
    rows: z.number().int().min(1).max(1000),
  })
  .strict();

export const TerminalSessionResponseSchema = z
  .object({ dev: z.literal(true), session: TerminalSessionSchema })
  .strict();
export const TerminalSessionListResponseSchema = z
  .object({ dev: z.literal(true), sessions: z.array(TerminalSessionSchema) })
  .strict();

// --- terminal WS frames ---------------------------------------------------
const seq = z.number().int().nonnegative();
const dim = z.number().int().min(1).max(1000);

export const TerminalClientFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input'), data: z.string() }).strict(),
  z.object({ type: z.literal('resize'), cols: dim, rows: dim }).strict(),
  z.object({ type: z.literal('resume'), afterSeq: seq }).strict(),
]);

export const TerminalServerFrameSchema = z.discriminatedUnion('type', [
  // data is base64-encoded terminal output
  z.object({ type: z.literal('output'), seq, data: z.base64() }).strict(),
  z.object({ type: z.literal('state'), state: TerminalSessionStateSchema }).strict(),
  z.object({ type: z.literal('exit'), code: z.number().int() }).strict(),
]);

// --- agent sessions -------------------------------------------------------
export const AgentSessionStateSchema = z.enum([
  'starting',
  'running',
  'needs_input',
  'stopped',
  'exited',
]);
// UI must label reattached (same process) vs resumed (from checkpoint), never one for the other.
export const AgentSessionContinuitySchema = z.enum(['new', 'reattached', 'resumed']);

export const AgentSessionSchema = z
  .object({
    id,
    harness: z.literal('mock'),
    task: z.string().min(1).max(2000),
    state: AgentSessionStateSchema,
    continuity: AgentSessionContinuitySchema,
    createdAt: timestamp,
    lastEventSeq: seq,
  })
  .strict();

export const CreateAgentSessionRequestSchema = z
  .object({ harness: z.literal('mock'), task: z.string().min(1).max(2000) })
  .strict();

export const AgentSessionResponseSchema = z
  .object({ dev: z.literal(true), session: AgentSessionSchema })
  .strict();
export const AgentSessionListResponseSchema = z
  .object({ dev: z.literal(true), sessions: z.array(AgentSessionSchema) })
  .strict();

// --- agent events (WS /agent-sessions/:id/events) -------------------------
const eventBase = { seq, ts: timestamp };

export const AgentEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...eventBase, kind: z.literal('status'), state: AgentSessionStateSchema }).strict(),
  z.object({ ...eventBase, kind: z.literal('output'), text: z.string() }).strict(),
  z
    .object({
      ...eventBase,
      kind: z.literal('tool_call'),
      tool: z.string().min(1),
      summary: z.string(),
    })
    .strict(),
  z.object({ ...eventBase, kind: z.literal('needs_input'), prompt: z.string() }).strict(),
  z.object({ ...eventBase, kind: z.literal('exit'), code: z.number().int() }).strict(),
]);

export const AgentClientFrameSchema = z
  .object({ type: z.literal('resume'), afterSeq: seq })
  .strict();

// --- approvals (read-only mock; NO approve/deny in M-D1) ------------------
export const ApprovalStatusSchema = z.enum(['pending', 'expired']);
export const ApprovalRiskSchema = z.enum(['low', 'medium', 'high']);

// Deliberately has no `approved` / decision field and no write counterpart.
export const ApprovalSchema = z
  .object({
    id,
    summary: z.string().min(1).max(512),
    requestedBy: z.string().min(1).max(128),
    hostId: id.nullable(),
    agentSessionId: id.nullable(),
    risk: ApprovalRiskSchema,
    status: ApprovalStatusSchema,
    createdAt: timestamp,
    devMock: z.literal(true),
  })
  .strict();

export const ApprovalListResponseSchema = z
  .object({ dev: z.literal(true), approvals: z.array(ApprovalSchema) })
  .strict();

// --- errors ---------------------------------------------------------------
export const ErrorResponseSchema = z
  .object({ error: z.object({ code: z.string(), message: z.string() }).strict() })
  .strict();

// --- types ----------------------------------------------------------------
export type Host = z.infer<typeof HostSchema>;
export type HostListResponse = z.infer<typeof HostListResponseSchema>;
export type TerminalSession = z.infer<typeof TerminalSessionSchema>;
export type CreateTerminalSessionRequest = z.infer<typeof CreateTerminalSessionRequestSchema>;
export type TerminalClientFrame = z.infer<typeof TerminalClientFrameSchema>;
export type TerminalServerFrame = z.infer<typeof TerminalServerFrameSchema>;
export type AgentSession = z.infer<typeof AgentSessionSchema>;
export type CreateAgentSessionRequest = z.infer<typeof CreateAgentSessionRequestSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentClientFrame = z.infer<typeof AgentClientFrameSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type ApprovalListResponse = z.infer<typeof ApprovalListResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
