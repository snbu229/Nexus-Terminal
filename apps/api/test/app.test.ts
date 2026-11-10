import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ErrorResponseSchema,
  HealthzSchema,
  HostListResponseSchema,
  HostResponseSchema,
  ReadyzSchema,
  hostFixtures,
} from '@nexus/contracts';
import { BODY_LIMIT_BYTES, buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const HOST = '127.0.0.1:3000';
const ORIGIN = 'http://127.0.0.1:5173';
const config = loadConfig({ NEXUS_DEV_MODE: '1', NEXUS_LOG_LEVEL: 'info' });
let app: FastifyInstance;
let logs: string[];
const logStream = { write: (m: string) => void logs.push(m) };

async function make(setup?: (a: FastifyInstance) => void) {
  logs = [];
  app = buildApp(config, { logStream });
  const rawInject = app.inject.bind(app) as (o: object) => unknown;
  // Default to an allowed Host so tests exercise one thing at a time; tests can override it.
  (app as { inject: unknown }).inject = (o: string | { url: string; headers?: object }) => {
    const opts: { url: string; headers?: object } = typeof o === 'string' ? { url: o } : o;
    return rawInject({ ...opts, headers: { host: HOST, ...opts.headers } });
  };
  setup?.(app);
  await app.ready();
  return app;
}
afterEach(() => app?.close());

describe('routes', () => {
  it('GET /healthz', async () => {
    await make();
    const res = await app.inject('/healthz');
    expect(res.statusCode).toBe(200);
    expect(HealthzSchema.parse(res.json())).toEqual({ status: 'ok', dev: true });
  });

  it('GET /readyz', async () => {
    await make();
    const res = await app.inject('/readyz');
    expect(res.statusCode).toBe(200);
    expect(ReadyzSchema.parse(res.json())).toEqual({
      status: 'ready',
      dev: true,
      checks: { fixtures: 'ok' },
    });
  });

  it('GET /api/v0/hosts returns all fixture hosts, schema-conformant, dev:true', async () => {
    await make();
    const res = await app.inject('/api/v0/hosts');
    expect(res.statusCode).toBe(200);
    const body = HostListResponseSchema.parse(res.json());
    expect(body.dev).toBe(true);
    expect(body.hosts).toEqual(hostFixtures);
  });

  it('GET /api/v0/hosts/:id returns one host', async () => {
    await make();
    const res = await app.inject('/api/v0/hosts/host-dev-02');
    expect(res.statusCode).toBe(200);
    const body = HostResponseSchema.parse(res.json());
    expect(body).toEqual({ dev: true, host: hostFixtures[1] });
  });

  it('GET /api/v0/hosts/:id unknown id gives the 404 error shape', async () => {
    await make();
    const res = await app.inject('/api/v0/hosts/nope');
    expect(res.statusCode).toBe(404);
    expect(ErrorResponseSchema.parse(res.json()).error.code).toBe('not_found');
  });

  it('GET /api/v0/hosts/:id with an over-long id is a 400 ErrorResponse', async () => {
    await make();
    const res = await app.inject(`/api/v0/hosts/${'a'.repeat(65)}`);
    expect(res.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(res.json()).error.code).toBe('bad_request');
  });

  it('unknown routes use the error shape; no approve/deny route exists', async () => {
    await make();
    for (const [method, url] of [
      ['GET', '/nope'],
      ['POST', '/api/v0/approvals/appr-dev-01/approve'],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(404);
      ErrorResponseSchema.parse(res.json());
    }
  });
});

describe('origin guard and CORS', () => {
  it('rejects a bad Origin with 403 and an ErrorResponse', async () => {
    await make();
    const res = await app.inject({
      url: '/api/v0/hosts',
      headers: { origin: 'http://evil.example' },
    });
    expect(res.statusCode).toBe(403);
    expect(ErrorResponseSchema.parse(res.json()).error.code).toBe('origin_not_allowed');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects a bad Origin on preflight too', async () => {
    await make();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v0/hosts',
      headers: { origin: 'http://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows the configured origin and echoes only it', async () => {
    await make();
    const res = await app.inject({ url: '/api/v0/hosts', headers: { origin: ORIGIN } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
  });

  it('allows requests with no Origin (curl, health checks)', async () => {
    await make();
    expect((await app.inject('/healthz')).statusCode).toBe(200);
  });

  it('answers preflight for the allowed origin only', async () => {
    await make();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v0/hosts',
      headers: { origin: ORIGIN, 'access-control-request-method': 'GET' },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
  });
});

describe('request body size limit (A2)', () => {
  it('rejects bodies over the limit with 413 and an ErrorResponse', async () => {
    await make((a) => a.post('/__test/echo', async (req) => req.body));
    const res = await app.inject({
      method: 'POST',
      url: '/__test/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ data: 'a'.repeat(BODY_LIMIT_BYTES) }),
    });
    expect(res.statusCode).toBe(413);
    expect(ErrorResponseSchema.parse(res.json()).error.code).toBe('payload_too_large');
  });

  it('limit leaves room for a max-size (64 KiB) terminal input body', () => {
    expect(BODY_LIMIT_BYTES).toBeGreaterThan(64 * 1024 + 1024);
  });

  it('malformed JSON is a 400 ErrorResponse', async () => {
    await make((a) => a.post('/__test/echo', async (req) => req.body));
    const res = await app.inject({
      method: 'POST',
      url: '/__test/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(res.statusCode).toBe(400);
    ErrorResponseSchema.parse(res.json());
  });
});

describe('logging', () => {
  it('never logs request bodies, headers, query strings or env values', async () => {
    const secretEnv = 'ENV-SECRET-VALUE-9f3a';
    process.env.NEXUS_TEST_SECRET = secretEnv;
    try {
      await make((a) => a.post('/__test/echo', async (req) => req.body));
      await app.inject({
        method: 'POST',
        url: '/__test/echo?token=QUERY-SECRET',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer HEADER-SECRET',
          cookie: 'sid=COOKIE-SECRET',
        },
        payload: JSON.stringify({ password: 'BODY-SECRET' }),
      });
      await app.inject({ url: '/api/v0/hosts', headers: { origin: 'http://evil.example' } });
      const all = logs.join('\n');
      expect(all).toContain('/__test/echo'); // requests are logged...
      for (const s of [
        'BODY-SECRET',
        'HEADER-SECRET',
        'COOKIE-SECRET',
        'QUERY-SECRET',
        secretEnv,
      ]) {
        expect(all, s).not.toContain(s);
      }
    } finally {
      delete process.env.NEXUS_TEST_SECRET;
    }
  });
});

describe('Host header guard (DNS rebinding)', () => {
  it.each([
    'attacker.example:3000',
    '127.0.0.1:4000',
    '127.0.0.1',
    'localhost.evil.example:3000',
    '',
  ])('rejects Host %j without an Origin header', async (host) => {
    await make();
    const res = await app.inject({ url: '/api/v0/hosts', headers: { host } });
    expect(res.statusCode).toBe(403);
    expect(ErrorResponseSchema.parse(res.json()).error.code).toBe('host_not_allowed');
  });

  it.each(['127.0.0.1:3000', 'localhost:3000', 'LOCALHOST:3000', '[::1]:3000'])(
    'accepts Host %s',
    async (host) => {
      await make();
      expect((await app.inject({ url: '/healthz', headers: { host } })).statusCode).toBe(200);
    },
  );

  it('compose mode uses only the configured list', async () => {
    logs = [];
    app = buildApp(
      loadConfig({
        NEXUS_DEV_MODE: '1',
        NEXUS_DEV_COMPOSE: '1',
        NEXUS_API_HOST: '0.0.0.0',
        NEXUS_API_ALLOWED_HOSTS: 'api:3000',
      }),
      { logStream },
    );
    await app.ready();
    const at = (host: string) => app.inject({ url: '/healthz', headers: { host } });
    expect((await at('api:3000')).statusCode).toBe(200);
    expect((await at('127.0.0.1:3000')).statusCode).toBe(403);
    expect((await at('localhost:3000')).statusCode).toBe(403);
  });
});

describe('framework errors use the ErrorResponse contract', () => {
  it('a 120-character id returns 400 bad_request without echoing the URL', async () => {
    await make();
    const id = 'a'.repeat(120);
    const res = await app.inject(`/api/v0/hosts/${id}`);
    expect(res.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(res.json()).error.code).toBe('bad_request');
    expect(res.body).not.toContain(id);
  });

  it('malformed percent-encoding returns 400 bad_request', async () => {
    await make();
    const res = await app.inject('/api/v0/hosts/%E0%A4%A');
    expect(res.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(res.json()).error.code).toBe('bad_request');
    expect(res.body).not.toContain('%E0');
  });
});
