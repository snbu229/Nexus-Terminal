import {
  API_PREFIX,
  AgentSessionListResponseSchema,
  AgentSessionResponseSchema,
  ApprovalListResponseSchema,
  ErrorResponseSchema,
  HostListResponseSchema,
  HostResponseSchema,
  TerminalSessionListResponseSchema,
  TerminalSessionResponseSchema,
  type AgentSession,
  type Approval,
  type CreateTerminalSessionRequest,
  type Host,
  type TerminalSession,
} from '@nexus/contracts';
import type { z } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface NexusClient {
  listHosts(): Promise<Host[]>;
  getHost(id: string): Promise<Host>;
  listTerminalSessions(): Promise<TerminalSession[]>;
  createTerminalSession(req: CreateTerminalSessionRequest): Promise<TerminalSession>;
  listAgentSessions(): Promise<AgentSession[]>;
  getAgentSession(id: string): Promise<AgentSession>;
  listApprovals(): Promise<Approval[]>;
}

// Credentials and grant tokens never go in URLs: only opaque ids are interpolated.
export function createClient(
  baseUrl = '',
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): NexusClient {
  async function request<S extends z.ZodType>(
    schema: S,
    path: string,
    init?: RequestInit,
  ): Promise<z.infer<S>> {
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${API_PREFIX}${path}`, init);
    } catch {
      throw new ApiError(0, 'network', 'Could not reach the API.');
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = ErrorResponseSchema.safeParse(body);
      throw parsed.success
        ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.message)
        : new ApiError(res.status, 'http', `Request failed (${res.status}).`);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(res.status, 'bad_response', 'The API returned an unexpected response.');
    }
    return parsed.data;
  }
  const enc = encodeURIComponent;
  return {
    listHosts: async () => (await request(HostListResponseSchema, '/hosts')).hosts,
    getHost: async (id) => (await request(HostResponseSchema, `/hosts/${enc(id)}`)).host,
    listTerminalSessions: async () =>
      (await request(TerminalSessionListResponseSchema, '/terminal-sessions')).sessions,
    createTerminalSession: async (req) =>
      (
        await request(TerminalSessionResponseSchema, '/terminal-sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(req),
        })
      ).session,
    listAgentSessions: async () =>
      (await request(AgentSessionListResponseSchema, '/agent-sessions')).sessions,
    getAgentSession: async (id) =>
      (await request(AgentSessionResponseSchema, `/agent-sessions/${enc(id)}`)).session,
    listApprovals: async () => (await request(ApprovalListResponseSchema, '/approvals')).approvals,
  };
}
