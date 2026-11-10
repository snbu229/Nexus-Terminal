import { isIP } from 'node:net';

// Dev-mode guard, see plan §5 on EZF-43. The API is unauthenticated and dev-only.

export class GuardError extends Error {
  override readonly name = 'GuardError';
}

export interface ApiConfig {
  host: string;
  port: number;
  /** The single web origin allowed by CORS and the Origin check. */
  allowedOrigin: string;
  devCompose: boolean;
  /** Exact Host header values accepted (DNS-rebinding guard). Lower-case, no wildcards. */
  allowedHosts: readonly string[];
  logLevel: string;
}

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 3000;
export const DEFAULT_WEB_ORIGIN = 'http://127.0.0.1:5173';

export function isLoopbackHost(host: string): boolean {
  if (host === 'localhost') return true;
  const kind = isIP(host);
  if (kind === 4) return host.startsWith('127.');
  if (kind === 6) return host === '::1' || host === '0:0:0:0:0:0:0:1';
  return false;
}

function parseOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new GuardError(`NEXUS_WEB_ORIGIN is not a valid origin: ${JSON.stringify(raw)}`);
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== raw) {
    throw new GuardError(
      `NEXUS_WEB_ORIGIN must be a bare http(s) origin such as ${DEFAULT_WEB_ORIGIN} (no path, no wildcard)`,
    );
  }
  return url.origin;
}

const HOST_ENTRY =
  /^(?:[a-z0-9]([a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:]+\]):[0-9]{1,5}$/;

function parseAllowedHosts(raw: string | undefined): string[] {
  const entries = (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== '');
  for (const e of entries) {
    if (!HOST_ENTRY.test(e)) {
      throw new GuardError(
        `NEXUS_API_ALLOWED_HOSTS entry ${JSON.stringify(e)} must be an exact host:port (no wildcards, no scheme).`,
      );
    }
  }
  return entries;
}

/** Reads and validates configuration. Throws GuardError when the guard rules are not met. */
export function loadConfig(env: NodeJS.ProcessEnv): ApiConfig {
  if (env.NEXUS_DEV_MODE !== '1') {
    throw new GuardError('Refusing to start: this is a dev-only API. Set NEXUS_DEV_MODE=1.');
  }
  const devCompose = env.NEXUS_DEV_COMPOSE === '1';
  const host = env.NEXUS_API_HOST?.trim() || DEFAULT_HOST;
  if (!isLoopbackHost(host) && !devCompose) {
    throw new GuardError(
      `Refusing to bind non-loopback address ${JSON.stringify(host)}: only allowed inside the dev compose network (NEXUS_DEV_COMPOSE=1).`,
    );
  }
  const rawPort = env.NEXUS_API_PORT?.trim();
  const port = rawPort ? Number(rawPort) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new GuardError(`NEXUS_API_PORT is not a valid port: ${JSON.stringify(rawPort)}`);
  }
  // Loopback mode accepts only loopback Host names on our port. Compose mode has no safe default: the
  // operator must list the exact Host values the web container uses.
  let allowedHosts: string[];
  if (devCompose) {
    allowedHosts = parseAllowedHosts(env.NEXUS_API_ALLOWED_HOSTS);
    if (allowedHosts.length === 0) {
      throw new GuardError(
        'NEXUS_DEV_COMPOSE=1 requires NEXUS_API_ALLOWED_HOSTS (exact host:port list).',
      );
    }
  } else {
    allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  }
  return {
    host,
    port,
    allowedOrigin: parseOrigin(env.NEXUS_WEB_ORIGIN?.trim() || DEFAULT_WEB_ORIGIN),
    devCompose,
    allowedHosts,
    logLevel: env.NEXUS_LOG_LEVEL?.trim() || 'info',
  };
}
