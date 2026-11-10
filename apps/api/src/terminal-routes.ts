import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  API_PREFIX,
  CreateTerminalSessionRequestSchema,
  TerminalClientFrameSchema,
  TerminalSessionListResponseSchema,
  TerminalSessionResponseSchema,
  type ErrorResponse,
} from '@nexus/contracts';
import type { ApiConfig } from './config.js';
import { SessionError, SessionManager, type Subscriber } from './sessions.js';

/**
 * Largest accepted WebSocket message (A2). Terminal input is capped at 64 KiB by the contract, so this leaves
 * room for the JSON envelope only. Larger frames make `ws` close the socket with 1009.
 */
export const WS_MAX_PAYLOAD_BYTES = 80 * 1024;
/** A client that lets this much output pile up is disconnected (it can resume later). */
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

const errorBody = (code: string, message: string): ErrorResponse => ({ error: { code, message } });
const STREAM_PATH = new RegExp(`^${API_PREFIX}/terminal-sessions/([^/]{1,64})/stream$`);

function reject(socket: Duplex, status: number, text: string) {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function registerTerminalRoutes(app: FastifyInstance, config: ApiConfig): SessionManager {
  const sessions = new SessionManager(config);
  const wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD_BYTES });

  app.post(`${API_PREFIX}/terminal-sessions`, async (req, reply) => {
    const parsed = CreateTerminalSessionRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(errorBody('bad_request', 'Invalid request.'));
    try {
      const s = await sessions.create(parsed.data.hostId, parsed.data.cols, parsed.data.rows);
      return reply
        .code(201)
        .send(TerminalSessionResponseSchema.parse({ dev: true, session: s.snapshot }));
    } catch (e) {
      if (e instanceof SessionError) return reply.code(e.status).send(errorBody(e.code, e.message));
      throw e;
    }
  });

  app.get(`${API_PREFIX}/terminal-sessions`, async () =>
    TerminalSessionListResponseSchema.parse({ dev: true, sessions: sessions.list() }),
  );

  app.get<{ Params: { id: string } }>(`${API_PREFIX}/terminal-sessions/:id`, async (req, reply) => {
    const s = sessions.get(req.params.id);
    if (!s) return reply.code(404).send(errorBody('not_found', 'Session not found.'));
    return TerminalSessionResponseSchema.parse({ dev: true, session: s.snapshot });
  });

  app.delete<{ Params: { id: string } }>(
    `${API_PREFIX}/terminal-sessions/:id`,
    async (req, reply) => {
      if (!(await sessions.delete(req.params.id))) {
        return reply.code(404).send(errorBody('not_found', 'Session not found.'));
      }
      return reply.code(204).send();
    },
  );

  // WebSocket upgrade. Fastify's HTTP hooks do not run for upgrades, so Host and Origin are checked here.
  const allowedHosts = new Set(config.allowedHosts);
  app.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => undefined);
    const path = (req.url ?? '').split('?')[0] ?? '';
    const m = STREAM_PATH.exec(path);
    if (!m) return reject(socket, 404, 'Not Found');
    const host = req.headers.host?.toLowerCase();
    if (host === undefined || !allowedHosts.has(host)) return reject(socket, 403, 'Forbidden');
    // Browsers always send Origin on WebSocket handshakes; a missing or different one is refused.
    if (req.headers.origin !== config.allowedOrigin) return reject(socket, 403, 'Forbidden');
    let id: string;
    try {
      id = decodeURIComponent(m[1] ?? '');
    } catch {
      return reject(socket, 400, 'Bad Request');
    }
    const session = sessions.get(id);
    if (!session) return reject(socket, 404, 'Not Found');
    wss.handleUpgrade(req, socket, head, (ws) => bind(ws, id));
  });

  function bind(ws: WebSocket, id: string) {
    const session = sessions.get(id);
    if (!session) return ws.close(1011, 'session gone');
    const sub: Subscriber = {
      send(frame) {
        if (ws.readyState !== ws.OPEN) return;
        if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return ws.close(1013, 'slow consumer');
        ws.send(JSON.stringify(frame));
      },
    };
    if (!session.attach(sub)) return ws.close(1013, 'too many sockets');
    ws.on('close', () => session.detach(sub));
    ws.on('error', () => session.detach(sub));
    ws.on('message', (raw, isBinary) => {
      let frame;
      try {
        if (isBinary) throw new Error('binary');
        frame = TerminalClientFrameSchema.parse(JSON.parse(String(raw)));
      } catch {
        return ws.close(1008, 'invalid frame');
      }
      switch (frame.type) {
        case 'input':
          return session.input(frame.data);
        case 'resize':
          return session.resize(frame.cols, frame.rows);
        case 'resume':
          if (!session.resume(sub, frame.afterSeq)) ws.close(1008, 'invalid resume');
      }
    });
  }

  // preClose runs before the HTTP server starts closing; upgraded sockets would otherwise keep it open forever.
  app.addHook('preClose', async () => {
    for (const c of wss.clients) c.terminate();
    wss.close();
    await sessions.close();
  });
  return sessions;
}
