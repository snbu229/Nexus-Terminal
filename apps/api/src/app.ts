import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import {
  API_PREFIX,
  HealthzSchema,
  HostListResponseSchema,
  HostResponseSchema,
  ReadyzSchema,
  HostSchema,
  hostFixtures,
  type ErrorResponse,
} from '@nexus/contracts';
import type { ApiConfig } from './config.js';
import { registerTerminalRoutes } from './terminal-routes.js';

/** Largest accepted request body. Terminal input is capped at 64 KiB by the contract; the rest is JSON overhead. */
export const BODY_LIMIT_BYTES = 128 * 1024;

export interface BuildOptions {
  /** Log destination (tests capture it); defaults to stdout. */
  logStream?: { write(msg: string): void };
}

const errorBody = (code: string, message: string): ErrorResponse => ({ error: { code, message } });

export function buildApp(config: ApiConfig, options: BuildOptions = {}): FastifyInstance {
  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    // Router-level failures (over-long params, bad percent-encoding) otherwise bypass the error handler
    // and echo the URL back. Answer with the contract shape and no input.
    frameworkErrors: (_err, _req, reply) => {
      void (reply as FastifyReply).code(400).send(errorBody('bad_request', 'Invalid request.'));
    },
    // Never log bodies, headers (cookies/authorization) or env: only method, path and status.
    logger: {
      level: config.logLevel,
      ...(options.logStream ? { stream: options.logStream } : {}),
      serializers: {
        req: (req: { method?: string; url?: string }) => ({
          method: req.method ?? '',
          path: req.url?.split('?')[0] ?? '',
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode ?? 0 }),
      },
    },
  });

  // DNS-rebinding guard: the API is unauthenticated, so only answer to known Host values.
  const allowedHosts = new Set(config.allowedHosts);
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host?.toLowerCase();
    if (host === undefined || !allowedHosts.has(host)) {
      return reply.code(403).send(errorBody('host_not_allowed', 'Host is not allowed.'));
    }
  });

  // Reject browser requests from any other origin outright (CORS alone only hides the response).
  // Requests without an Origin header (curl, health checks, same-origin GETs) are not browser cross-origin calls.
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== config.allowedOrigin) {
      return reply.code(403).send(errorBody('origin_not_allowed', 'Origin is not allowed.'));
    }
  });

  // Registered after the Origin hook so that bad-Origin preflights are rejected first.
  // CORS is limited to the one configured web origin.
  void app.register(cors, { origin: [config.allowedOrigin] });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send(errorBody('not_found', 'Route not found.')),
  );
  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status === 413) {
      return reply.code(413).send(errorBody('payload_too_large', 'Request body is too large.'));
    }
    if (status >= 400 && status < 500) {
      return reply.code(400).send(errorBody('bad_request', 'Invalid request.'));
    }
    req.log.error({ err: { name: err.name, code: err.code } }, 'unhandled error');
    return reply.code(500).send(errorBody('internal', 'Internal error.'));
  });

  app.get('/healthz', async () => HealthzSchema.parse({ status: 'ok', dev: true }));

  app.get('/readyz', async (_req, reply) => {
    const fixturesOk = hostFixtures.every((h) => HostSchema.safeParse(h).success);
    const body = ReadyzSchema.parse({
      status: fixturesOk ? 'ready' : 'not_ready',
      dev: true,
      checks: { fixtures: fixturesOk ? 'ok' : 'fail' },
    });
    return reply.code(fixturesOk ? 200 : 503).send(body);
  });

  app.get(`${API_PREFIX}/hosts`, async () =>
    HostListResponseSchema.parse({ dev: true, hosts: hostFixtures }),
  );

  app.get<{ Params: { id: string } }>(`${API_PREFIX}/hosts/:id`, async (req, reply) => {
    const { id } = req.params;
    if (id.length < 1 || id.length > 64) {
      return reply.code(400).send(errorBody('bad_request', 'Invalid host id.'));
    }
    const host = hostFixtures.find((h) => h.id === id);
    if (!host) return reply.code(404).send(errorBody('not_found', 'Host not found.'));
    return HostResponseSchema.parse({ dev: true, host });
  });

  registerTerminalRoutes(app, config);

  return app;
}
