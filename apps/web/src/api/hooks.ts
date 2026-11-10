import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentEvent, CreateTerminalSessionRequest } from '@nexus/contracts';
import { useEffect, useState } from 'react';
import type { ConnectionState } from './agentEvents';
import { useApi } from './context';

export const keys = {
  hosts: ['hosts'] as const,
  host: (id: string) => ['hosts', id] as const,
  terminals: ['terminal-sessions'] as const,
  agents: ['agent-sessions'] as const,
  agent: (id: string) => ['agent-sessions', id] as const,
  approvals: ['approvals'] as const,
};

export function useHosts() {
  const { client } = useApi();
  return useQuery({ queryKey: keys.hosts, queryFn: () => client.listHosts() });
}
export function useHost(id: string) {
  const { client } = useApi();
  return useQuery({ queryKey: keys.host(id), queryFn: () => client.getHost(id) });
}
export function useTerminalSessions() {
  const { client } = useApi();
  return useQuery({ queryKey: keys.terminals, queryFn: () => client.listTerminalSessions() });
}
export function useCreateTerminalSession() {
  const { client } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateTerminalSessionRequest) => client.createTerminalSession(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.terminals }),
  });
}
export function useAgentSessions() {
  const { client } = useApi();
  return useQuery({
    queryKey: keys.agents,
    queryFn: () => client.listAgentSessions(),
    refetchInterval: 5000,
  });
}
export function useAgentSession(id: string) {
  const { client } = useApi();
  return useQuery({
    queryKey: keys.agent(id),
    queryFn: () => client.getAgentSession(id),
    refetchInterval: 5000,
  });
}
export function useApprovals() {
  const { client } = useApi();
  return useQuery({ queryKey: keys.approvals, queryFn: () => client.listApprovals() });
}

/** Accumulates seq-ordered events; duplicates after a resume are dropped. */
export function useAgentEvents(id: string) {
  const { events } = useApi();
  const [list, setList] = useState<AgentEvent[]>([]);
  const [conn, setConn] = useState<ConnectionState>('connecting');
  useEffect(() => {
    setList([]);
    let last = 0;
    return events.subscribe(
      id,
      {
        onEvent: (e) => {
          if (e.seq <= last) return;
          last = e.seq;
          setList((l) => [...l, e]);
        },
        onState: setConn,
      },
      0,
    );
  }, [events, id]);
  return { events: list, connection: conn };
}
