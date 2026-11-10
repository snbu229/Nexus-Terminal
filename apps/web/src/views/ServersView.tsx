import type { Host } from '@nexus/contracts';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useCreateTerminalSession, useHost, useHosts } from '../api/hooks';
import { QueryState, StatusPill, errorMessage, type Tone } from '../components/ui';
import { useTitle } from '../components/useTitle';

const OS_LABEL = { linux: 'Linux', darwin: 'macOS' } as const;
const STATUS: Record<Host['status'], { label: string; tone: Tone }> = {
  online: { label: 'Reachable', tone: 'ok' },
  offline: { label: 'Unreachable', tone: 'danger' },
  unknown: { label: 'Unverified', tone: 'muted' },
};

export function ServersView() {
  useTitle('Servers');
  const { id } = useParams();
  const hosts = useHosts();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | Host['status']>('all');

  return (
    <div className="split">
      <section aria-labelledby="servers-h">
        <h1 id="servers-h">Servers</h1>
        <div className="filters" role="search">
          <label>
            Search servers
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">All</option>
              <option value="online">Reachable</option>
              <option value="offline">Unreachable</option>
              <option value="unknown">Unverified</option>
            </select>
          </label>
        </div>
        <QueryState
          query={hosts}
          what="servers"
          isEmpty={(d) => d.length === 0}
          emptyText="No servers yet."
        >
          {(all) => <HostList hosts={all} q={q} status={status} selected={id} />}
        </QueryState>
      </section>
      {id ? <HostDetail id={id} /> : null}
    </div>
  );
}

function HostList({
  hosts,
  q,
  status,
  selected,
}: {
  hosts: Host[];
  q: string;
  status: 'all' | Host['status'];
  selected: string | undefined;
}) {
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return hosts.filter(
      (h) =>
        (status === 'all' || h.status === status) &&
        (!needle ||
          [h.name, h.os, OS_LABEL[h.os], h.arch, ...h.tags].some((s) =>
            s.toLowerCase().includes(needle),
          )),
    );
  }, [hosts, q, status]);

  return (
    <>
      <p role="status" className="count">
        {shown.length} of {hosts.length} servers
      </p>
      {shown.length === 0 ? (
        <p className="state">No servers match your filters.</p>
      ) : (
        <table className="table">
          <caption className="sr-only">Server inventory</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">OS / arch</th>
              <th scope="col">Status</th>
              <th scope="col">Tags</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((h) => (
              <tr key={h.id} aria-current={h.id === selected ? 'true' : undefined}>
                <th scope="row">
                  <Link to={`/servers/${encodeURIComponent(h.id)}`}>{h.name}</Link>
                </th>
                <td>
                  {OS_LABEL[h.os]} {h.arch}
                </td>
                <td>
                  <StatusPill {...STATUS[h.status]} />
                </td>
                <td>{h.tags.length ? h.tags.join(', ') : 'none'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function HostDetail({ id }: { id: string }) {
  const host = useHost(id);
  const create = useCreateTerminalSession();
  const navigate = useNavigate();
  return (
    <aside aria-label="Server details" className="panel">
      <QueryState query={host} what="server">
        {(h) => {
          const blocked =
            h.status !== 'online'
              ? 'The server is not reachable.'
              : h.terminalProvider === 'none'
                ? 'This server has no terminal provider (SSH-only fallback not configured).'
                : null;
          return (
            <>
              <h2>{h.name}</h2>
              <dl>
                <dt>Status</dt>
                <dd>
                  <StatusPill {...STATUS[h.status]} />
                </dd>
                <dt>OS / arch</dt>
                <dd>
                  {OS_LABEL[h.os]} {h.arch}
                </dd>
                <dt>Environment</dt>
                <dd>{h.environment}</dd>
                <dt>Terminal provider</dt>
                <dd>{h.terminalProvider}</dd>
                <dt>Tags</dt>
                <dd>{h.tags.length ? h.tags.join(', ') : 'none'}</dd>
              </dl>
              <button
                type="button"
                disabled={blocked !== null || create.isPending}
                aria-describedby="open-term-why"
                onClick={() =>
                  create.mutate(
                    { hostId: h.id, cols: 80, rows: 24 },
                    { onSuccess: (s) => void navigate(`/terminals/${encodeURIComponent(s.id)}`) },
                  )
                }
              >
                Open terminal on {h.name}
              </button>
              <p id="open-term-why" className="hint">
                {blocked ?? 'Terminal pane is a placeholder until D1-07.'}
              </p>
              {create.isError ? <p role="alert">{errorMessage(create.error)}</p> : null}
            </>
          );
        }}
      </QueryState>
    </aside>
  );
}
