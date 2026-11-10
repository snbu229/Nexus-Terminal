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
  return {
    host,
    port,
    allowedOrigin: parseOrigin(env.NEXUS_WEB_ORIGIN?.trim() || DEFAULT_WEB_ORIGIN),
    devCompose,
    logLevel: env.NEXUS_LOG_LEVEL?.trim() || 'info',
  };
}
