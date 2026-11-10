import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createMockEventSource, createWsEventSource, type AgentEventSource } from './agentEvents';
import { createClient, type NexusClient } from './client';
import { readApiConfig, type ApiConfig } from './config';

interface Api {
  client: NexusClient;
  events: AgentEventSource;
  config: ApiConfig;
}

const ApiContext = createContext<Api | null>(null);

// Literal env comparison so Vite drops the dynamic import (and the fixtures) from real builds.
const loadMockEvents = async () => {
  if (import.meta.env.VITE_NEXUS_API === 'real') return [];
  return (await import('@nexus/contracts/fixtures')).agentEventFixtures;
};

export function makeApi(config: ApiConfig = readApiConfig()): Api {
  const client = createClient(config.baseUrl);
  const events =
    config.mode === 'real'
      ? createWsEventSource(config.baseUrl)
      : createMockEventSource(loadMockEvents, async (id) => {
          const s = await client.getAgentSession(id);
          return s.lastEventSeq;
        });
  return { client, events, config };
}

export function ApiProvider({
  api,
  queryClient,
  children,
}: {
  api?: Api;
  queryClient?: QueryClient;
  children: ReactNode;
}) {
  const value = useMemo(() => api ?? makeApi(), [api]);
  const qc = useMemo(
    () => queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    [queryClient],
  );
  return (
    <ApiContext.Provider value={value}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApi(): Api {
  const v = useContext(ApiContext);
  if (!v) throw new Error('ApiProvider missing');
  return v;
}
