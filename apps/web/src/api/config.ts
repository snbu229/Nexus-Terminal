// Switching from MSW mocks to the real API is a config flag: VITE_NEXUS_API=mock|real.
// Default is mock because M-D1 has no authentication and no real hosts.
export type ApiMode = 'mock' | 'real';

export interface ApiConfig {
  mode: ApiMode;
  /** Origin of the real API; empty string means same origin. */
  baseUrl: string;
}

export function readApiConfig(
  env: Record<string, string | undefined> = import.meta.env,
): ApiConfig {
  const mode: ApiMode = env['VITE_NEXUS_API'] === 'real' ? 'real' : 'mock';
  return { mode, baseUrl: env['VITE_NEXUS_API_URL'] ?? '' };
}
