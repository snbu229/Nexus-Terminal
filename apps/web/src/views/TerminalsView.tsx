import type { TerminalSession } from '@nexus/contracts';
import { Link, useParams } from 'react-router';
import { useHosts, useTerminalSessions } from '../api/hooks';
import { QueryState, StatusPill, formatTime, type Tone } from '../components/ui';
import { useTitle } from '../components/useTitle';

const STATE: Record<TerminalSession['state'], { label: string; tone: Tone }> = {
  starting: { label: 'Starting', tone: 'warn' },
  running: { label: 'Live', tone: 'ok' },
  exited: { label: 'Exited', tone: 'muted' },
};

export function TerminalsView() {
  useTitle('Terminals');
  const { id } = useParams();
  const sessions = useTerminalSessions();
  const hosts = useHosts();
  const hostName = (hid: string) => hosts.data?.find((h) => h.id === hid)?.name ?? hid;

  return (
    <section aria-labelledby="term-h">
      <h1 id="term-h">Terminal sessions</h1>
      <QueryState
        query={sessions}
        what="terminal sessions"
        isEmpty={(d) => d.length === 0}
        emptyText="No open terminal sessions. Open one from a server."
      >
        {(list) => {
          const active = list.find((s) => s.id === id) ?? null;
          return (
            <>
              <nav aria-label="Terminal sessions">
                <ul className="tabs">
                  {list.map((s) => (
                    <li key={s.id}>
                      <Link
                        to={`/terminals/${encodeURIComponent(s.id)}`}
                        aria-current={s.id === id ? 'page' : undefined}
                      >
                        {s.title} <StatusPill {...STATE[s.state]} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              {active ? (
                <div className="panel" role="region" aria-label={`Terminal ${active.title}`}>
                  <h2>{active.title}</h2>
                  <p>
                    Host {hostName(active.hostId)} · started {formatTime(active.createdAt)}
                  </p>
                  <div className="term-placeholder">
                    Terminal pane placeholder. The xterm view is wired in D1-07.
                  </div>
                </div>
              ) : (
                <p className="state">Select a session tab.</p>
              )}
            </>
          );
        }}
      </QueryState>
    </section>
  );
}
