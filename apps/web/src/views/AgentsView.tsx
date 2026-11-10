import type { AgentSession } from '@nexus/contracts';
import { Link, useParams } from 'react-router';
import { useAgentEvents, useAgentSession, useAgentSessions } from '../api/hooks';
import { QueryState, StatusPill, formatTime, type Tone } from '../components/ui';
import { useTitle } from '../components/useTitle';

const STATE: Record<AgentSession['state'], { label: string; tone: Tone }> = {
  starting: { label: 'Starting', tone: 'warn' },
  running: { label: 'Running', tone: 'ok' },
  needs_input: { label: 'Needs input', tone: 'warn' },
  stopped: { label: 'Stopped', tone: 'muted' },
  exited: { label: 'Exited', tone: 'muted' },
};

// Reattached (same process) and resumed (from checkpoint) are never conflated.
const CONTINUITY: Record<AgentSession['continuity'], string> = {
  new: 'New session',
  reattached: 'Reattached (same process)',
  resumed: 'Resumed (from checkpoint)',
};

export function AgentsView() {
  useTitle('Agent sessions');
  const { id } = useParams();
  const sessions = useAgentSessions();
  return (
    <div className="split">
      <section aria-labelledby="agents-h">
        <h1 id="agents-h">Agent sessions</h1>
        <QueryState
          query={sessions}
          what="agent sessions"
          isEmpty={(d) => d.length === 0}
          emptyText="No agent sessions."
        >
          {(list) => (
            <ul className="cards">
              {list.map((s) => (
                <li key={s.id} aria-current={s.id === id ? 'true' : undefined}>
                  <Link to={`/agents/${encodeURIComponent(s.id)}`}>{s.task}</Link>
                  <div>
                    <StatusPill {...STATE[s.state]} /> · {CONTINUITY[s.continuity]} · seq{' '}
                    {s.lastEventSeq}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </section>
      {id ? <AgentDetail id={id} /> : null}
    </div>
  );
}

function AgentDetail({ id }: { id: string }) {
  const session = useAgentSession(id);
  const { events, connection } = useAgentEvents(id);
  return (
    <aside aria-label="Agent session details" className="panel">
      <QueryState query={session} what="agent session">
        {(s) => (
          <>
            <h2>{s.task}</h2>
            <dl>
              <dt>Status</dt>
              <dd>
                <StatusPill {...STATE[s.state]} />
              </dd>
              <dt>Continuity</dt>
              <dd>{CONTINUITY[s.continuity]}</dd>
              <dt>Harness</dt>
              <dd>{s.harness}</dd>
              <dt>Last event seq</dt>
              <dd>{s.lastEventSeq}</dd>
              <dt>Started</dt>
              <dd>{formatTime(s.createdAt)}</dd>
            </dl>
            <h3>Event log</h3>
            <p role="status">
              Event stream:{' '}
              {
                {
                  connecting: 'Connecting',
                  live: 'Live',
                  reconnecting: 'Reconnecting',
                  closed: 'Closed',
                }[connection]
              }
            </p>
            {events.length === 0 ? (
              <p className="state">No events yet.</p>
            ) : (
              <ol className="log" aria-label="Agent events">
                {events.map((e) => (
                  <li key={e.seq}>
                    <span className="seq">#{e.seq}</span>{' '}
                    <time dateTime={e.ts}>{formatTime(e.ts)}</time> <strong>{e.kind}</strong>{' '}
                    <span translate="no">
                      {e.kind === 'status' && e.state}
                      {e.kind === 'output' && e.text}
                      {e.kind === 'tool_call' && `${e.tool}: ${e.summary}`}
                      {e.kind === 'needs_input' && e.prompt}
                      {e.kind === 'exit' && `exit code ${e.code}`}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </QueryState>
    </aside>
  );
}
