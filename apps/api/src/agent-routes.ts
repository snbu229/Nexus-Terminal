import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  API_PREFIX,
  AgentClientFrameSchema,
  AgentEventSchema,
  AgentSessionListResponseSchema,
  AgentSessionResponseSchema,
  CreateAgentSessionRequestSchema,
  type ErrorResponse,
} from '@nexus/contracts';
import {
  SESSION_ID_PATTERN,
  SessionNotFoundError,
  TooManySessionsError,
  type AgentSessionRegistry,
} from '@nexus/agent-sessions';

const errorBody = (code: string, message: string): ErrorResponse => ({ error: { code, message } });

/** A client that stops reading must not make us buffer without bound. */
const MAX_WS_BUFFERED_BYTES = 1024 * 1024;
/** Client frames are tiny ({type:'resume',afterSeq}); anything bigger is abuse. */
export const WS_MAX_PAYLOAD_BYTES = 1024;
/** A socket that never sends its resume frame is closed. */
const RESUME_FRAME_TIMEOUT_MS = 10_000;

function notFound(reply: FastifyReply) {
  return reply.code(404).send(errorBody('not_found', 'Agent session not found.'));
}

export function registerAgentRoutes(app: FastifyInstance, registry: AgentSessionRegistry): void {
  const base = `${API_PREFIX}/agent-sessions`;

  app.get(base, async () =>
    AgentSessionListResponseSchema.parse({ dev: true, sessions: registry.list() }),
  );

  app.post(base, async (req, reply) => {
    const parsed = CreateAgentSessionRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', 'Invalid request.'));
    try {
      const session = await registry.create(parsed.data.task);
      return reply.code(201).send(AgentSessionResponseSchema.parse({ dev: true, session }));
    } catch (err) {
      if (err instanceof TooManySessionsError) {
        return reply.code(400).send(errorBody('too_many_sessions', err.message));
      }
      throw err;
    }
  });

  app.get<{ Params: { id: string } }>(`${base}/:id`, async (req, reply) => {
    const session = SESSION_ID_PATTERN.test(req.params.id)
      ? registry.get(req.params.id)
      : undefined;
    if (!session) return notFound(reply);
    return AgentSessionResponseSchema.parse({ dev: true, session });
  });

  app.post<{ Params: { id: string } }>(`${base}/:id/stop`, async (req, reply) => {
    try {
      const session = await registry.stop(req.params.id);
      return AgentSessionResponseSchema.parse({ dev: true, session });
    } catch (err) {
      if (err instanceof SessionNotFoundError) return notFound(reply);
      throw err;
    }
  });

  // WS: the client sends {type:'resume', afterSeq} first; the server replays seq > afterSeq, then streams live.
  // Origin and Host are already enforced by the app-wide onRequest hooks (they run on the upgrade request).
  app.get<{ Params: { id: string } }>(`${base}/:id/events`, { websocket: true }, (socket, req) => {
    const id = req.params.id;
    if (!SESSION_ID_PATTERN.test(id) || !registry.get(id)) {
      socket.close(1008, 'not found');
      return;
    }
    let unsubscribe: (() => void) | null = null;
    const timer = setTimeout(
      () => socket.close(1008, 'resume frame required'),
      RESUME_FRAME_TIMEOUT_MS,
    );
    timer.unref();

    socket.on('message', (raw: Buffer) => {
      let frame;
      try {
        frame = AgentClientFrameSchema.safeParse(JSON.parse(raw.toString('utf8')));
      } catch {
        frame = null;
      }
      if (!frame?.success || unsubscribe !== null) {
        socket.close(1008, 'invalid frame');
        return;
      }
      clearTimeout(timer);
      unsubscribe = registry.subscribe(id, frame.data.afterSeq, (event) => {
        if (socket.bufferedAmount > MAX_WS_BUFFERED_BYTES) {
          socket.close(1013, 'slow consumer');
          return;
        }
        socket.send(JSON.stringify(AgentEventSchema.parse(event)));
      });
    });
    socket.on('close', () => {
      clearTimeout(timer);
      unsubscribe?.();
    });
    socket.on('error', () => socket.terminate());
  });
}
