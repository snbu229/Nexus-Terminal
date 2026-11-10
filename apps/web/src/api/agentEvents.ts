import { API_PREFIX, AgentEventSchema, type AgentEvent } from '@nexus/contracts';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'closed';

export interface AgentEventSource {
  /** Starts delivery; returns a stop function. Events carry seq, resume uses afterSeq. */
  subscribe(
    sessionId: string,
    handlers: {
      onEvent(e: AgentEvent): void;
      onState(s: ConnectionState): void;
    },
    afterSeq: number,
  ): () => void;
}

/** Mock source: replays fixture events up to `lastSeq` (no WebSocket involved). */
export function createMockEventSource(
  loadEvents: (id: string) => Promise<readonly AgentEvent[]>,
  lastSeqOf: (id: string) => Promise<number>,
): AgentEventSource {
  return {
    subscribe(id, h, afterSeq) {
      let stopped = false;
      h.onState('connecting');
      void Promise.all([loadEvents(id), lastSeqOf(id)]).then(([events, last]) => {
        if (stopped) return;
        for (const e of events) if (e.seq > afterSeq && e.seq <= last) h.onEvent(e);
        h.onState('live');
      });
      return () => {
        stopped = true;
      };
    },
  };
}

/** Real source: WS /agent-sessions/:id/events, resuming with {type:"resume", afterSeq}. */
export function createWsEventSource(
  baseUrl: string,
  WS: typeof WebSocket = WebSocket,
): AgentEventSource {
  const origin = baseUrl || window.location.origin;
  const wsBase = origin.replace(/^http/, 'ws');
  return {
    subscribe(id, h, afterSeq) {
      let stopped = false;
      let last = afterSeq;
      let attempt = 0;
      let ws: WebSocket | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const open = () => {
        h.onState(attempt === 0 ? 'connecting' : 'reconnecting');
        ws = new WS(`${wsBase}${API_PREFIX}/agent-sessions/${encodeURIComponent(id)}/events`);
        ws.onopen = () => {
          attempt = 0;
          ws?.send(JSON.stringify({ type: 'resume', afterSeq: last }));
          h.onState('live');
        };
        ws.onmessage = (m) => {
          let raw: unknown;
          try {
            raw = JSON.parse(String(m.data));
          } catch {
            return;
          }
          const parsed = AgentEventSchema.safeParse(raw);
          if (parsed.success && parsed.data.seq > last) {
            last = parsed.data.seq;
            h.onEvent(parsed.data);
          }
        };
        ws.onclose = () => {
          if (stopped) return;
          attempt += 1;
          h.onState('reconnecting');
          timer = setTimeout(open, Math.min(1000 * 2 ** attempt, 15000));
        };
      };
      open();
      return () => {
        stopped = true;
        clearTimeout(timer);
        if (ws) ws.onclose = null;
        ws?.close();
        h.onState('closed');
      };
    },
  };
}
