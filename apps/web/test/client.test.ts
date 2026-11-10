import { API_PREFIX } from '@nexus/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createMockEventSource, createWsEventSource } from '../src/api/agentEvents';
import { ApiError, createClient } from '../src/api/client';
import { readApiConfig } from '../src/api/config';
import { server } from '../src/mocks/server';

describe('config flag', () => {
  it('defaults to mock and switches to real', () => {
    expect(readApiConfig({})).toEqual({ mode: 'mock', baseUrl: '' });
    expect(
      readApiConfig({ VITE_NEXUS_API: 'real', VITE_NEXUS_API_URL: 'http://127.0.0.1:3000' }),
    ).toEqual({
      mode: 'real',
      baseUrl: 'http://127.0.0.1:3000',
    });
  });
});

describe('typed client', () => {
  const client = createClient('http://localhost');

  it('parses responses with the contract schemas', async () => {
    expect((await client.listHosts()).length).toBe(8);
    expect((await client.getHost('host-dev-01')).name).toBe('dev-linux-amd64-01');
  });

  it('rejects a response that violates the contract', async () => {
    server.use(
      http.get(`*${API_PREFIX}/hosts`, () =>
        HttpResponse.json({ dev: true, hosts: [{ id: 'x' }] }),
      ),
    );
    await expect(client.listHosts()).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('maps error bodies and network failures to ApiError', async () => {
    await expect(client.getHost('nope')).rejects.toMatchObject({ status: 404, code: 'not_found' });
    server.use(http.get(`*${API_PREFIX}/hosts`, () => HttpResponse.error()));
    await expect(client.listHosts()).rejects.toBeInstanceOf(ApiError);
  });

  it('never puts anything but the opaque id in the URL', async () => {
    let seen = '';
    server.use(
      http.get(`*${API_PREFIX}/hosts/:id`, ({ request }) => {
        seen = request.url;
        return HttpResponse.json({ error: { code: 'not_found', message: 'x' } }, { status: 404 });
      }),
    );
    await client.getHost('a b/../?token=1').catch(() => undefined);
    expect(new URL(seen).search).toBe('');
    expect(seen).toContain('a%20b%2F..%2F%3Ftoken%3D1');
  });
});

describe('agent event sources', () => {
  it('mock source replays only events after afterSeq up to lastSeq', async () => {
    const events = [1, 2, 3].map((seq) => ({
      seq,
      ts: '2026-11-10T09:05:00.000Z',
      kind: 'output' as const,
      text: 't',
    }));
    const got: number[] = [];
    await new Promise<void>((resolve) => {
      createMockEventSource(
        async () => events,
        async () => 3,
      ).subscribe(
        's',
        { onEvent: (e) => got.push(e.seq), onState: (s) => s === 'live' && resolve() },
        1,
      );
    });
    expect(got).toEqual([2, 3]);
  });

  it('ws source sends resume with the last seq on reconnect and drops duplicates', () => {
    const sockets: FakeWS[] = [];
    class FakeWS {
      sent: string[] = [];
      onopen: (() => void) | null = null;
      onmessage: ((m: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      constructor(public url: string) {
        sockets.push(this);
      }
      send(d: string) {
        this.sent.push(d);
      }
      close() {}
    }
    const got: number[] = [];
    const states: string[] = [];
    const ev = (seq: number) =>
      JSON.stringify({ seq, ts: '2026-11-10T09:05:00.000Z', kind: 'output', text: 'x' });
    const stop = createWsEventSource(
      'http://127.0.0.1:1',
      FakeWS as unknown as typeof WebSocket,
    ).subscribe('a1', { onEvent: (e) => got.push(e.seq), onState: (s) => states.push(s) }, 0);
    const s0 = sockets[0]!;
    expect(s0.url).toBe(`ws://127.0.0.1:1${API_PREFIX}/agent-sessions/a1/events`);
    s0.onopen!();
    s0.onmessage!({ data: ev(1) });
    s0.onmessage!({ data: ev(1) });
    s0.onmessage!({ data: ev(2) });
    s0.onmessage!({ data: 'not json' });
    expect(got).toEqual([1, 2]);
    expect(s0.sent).toEqual([JSON.stringify({ type: 'resume', afterSeq: 0 })]);
    s0.onclose!();
    expect(states.at(-1)).toBe('reconnecting');
    stop();
    expect(states.at(-1)).toBe('closed');
  });
});
