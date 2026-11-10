import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { GuardError, isLoopbackHost, loadConfig } from '../src/config.js';

const dev = { NEXUS_DEV_MODE: '1' };

describe('dev-mode guard', () => {
  it('refuses to start without NEXUS_DEV_MODE=1', () => {
    expect(() => loadConfig({})).toThrow(GuardError);
    expect(() => loadConfig({ NEXUS_DEV_MODE: '0' })).toThrow(/NEXUS_DEV_MODE=1/);
    expect(() => loadConfig({ NEXUS_DEV_MODE: 'true' })).toThrow(GuardError);
  });

  it('binds 127.0.0.1:3000 by default', () => {
    expect(loadConfig(dev)).toMatchObject({ host: '127.0.0.1', port: 3000, devCompose: false });
  });

  it.each(['0.0.0.0', '192.168.1.10', '::', 'example.com', '10.0.0.1'])(
    'refuses non-loopback bind %s outside compose',
    (host) => {
      expect(() => loadConfig({ ...dev, NEXUS_API_HOST: host })).toThrow(/non-loopback/);
    },
  );

  it.each(['127.0.0.1', '127.0.0.2', '::1', 'localhost'])('allows loopback bind %s', (host) => {
    expect(loadConfig({ ...dev, NEXUS_API_HOST: host }).host).toBe(host);
  });

  it('allows a non-loopback bind only with NEXUS_DEV_COMPOSE=1', () => {
    const c = loadConfig({
      ...dev,
      NEXUS_API_HOST: '0.0.0.0',
      NEXUS_DEV_COMPOSE: '1',
      NEXUS_API_ALLOWED_HOSTS: 'api:3000, Web-Proxy.local:3000',
    });
    expect(c).toMatchObject({
      host: '0.0.0.0',
      devCompose: true,
      allowedHosts: ['api:3000', 'web-proxy.local:3000'],
    });
  });

  it('defaults allowed Hosts to loopback names on the configured port', () => {
    expect(loadConfig({ ...dev, NEXUS_API_PORT: '4000' }).allowedHosts).toEqual([
      '127.0.0.1:4000',
      'localhost:4000',
      '[::1]:4000',
    ]);
  });

  it('compose mode requires an explicit allowed-Host list', () => {
    expect(() => loadConfig({ ...dev, NEXUS_API_HOST: '0.0.0.0', NEXUS_DEV_COMPOSE: '1' })).toThrow(
      /NEXUS_API_ALLOWED_HOSTS/,
    );
  });

  it.each(['*', '*.example:3000', 'http://api:3000', 'api', 'api:3000/x'])(
    'rejects allowed-Host entry %s',
    (entry) => {
      expect(() =>
        loadConfig({
          ...dev,
          NEXUS_API_HOST: '0.0.0.0',
          NEXUS_DEV_COMPOSE: '1',
          NEXUS_API_ALLOWED_HOSTS: entry,
        }),
      ).toThrow(GuardError);
    },
  );

  it('does not treat lookalike hosts as loopback', () => {
    expect(isLoopbackHost('127.0.0.1.evil.com')).toBe(false);
    expect(isLoopbackHost('localhost.evil.com')).toBe(false);
  });

  it('validates the allowed web origin and rejects wildcards and paths', () => {
    expect(loadConfig({ ...dev, NEXUS_WEB_ORIGIN: 'http://localhost:8080' }).allowedOrigin).toBe(
      'http://localhost:8080',
    );
    for (const bad of ['*', 'http://localhost:8080/', 'http://x/y', 'ftp://x', 'nope']) {
      expect(() => loadConfig({ ...dev, NEXUS_WEB_ORIGIN: bad }), bad).toThrow(GuardError);
    }
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...dev, NEXUS_API_PORT: '70000' })).toThrow(GuardError);
    expect(() => loadConfig({ ...dev, NEXUS_API_PORT: 'abc' })).toThrow(GuardError);
  });
});

describe('process entrypoint', () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
      cwd: new URL('..', import.meta.url),
      // Minimal env: nothing inherited from the test runner.
      env: { PATH: process.env.PATH ?? '', ...env },
      encoding: 'utf8',
      timeout: 20_000,
    });

  it('exits non-zero without NEXUS_DEV_MODE', () => {
    const r = run({});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NEXUS_DEV_MODE=1');
  });

  it('exits non-zero for a non-loopback bind', () => {
    const r = run({ NEXUS_DEV_MODE: '1', NEXUS_API_HOST: '0.0.0.0' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('non-loopback');
  });
});
