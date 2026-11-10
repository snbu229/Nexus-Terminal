import type { Approval } from '@nexus/contracts';
import { Link, useParams } from 'react-router';
import { useApprovals } from '../api/hooks';
import { QueryState, StatusPill, formatTime, type Tone } from '../components/ui';
import { useTitle } from '../components/useTitle';

const NO_AUTHORITY = 'dev mock: no authority';
const STATUS: Record<Approval['status'], { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warn' },
  expired: { label: 'Expired', tone: 'muted' },
};
const RISK: Record<Approval['risk'], { label: string; tone: Tone }> = {
  low: { label: 'Low risk', tone: 'ok' },
  medium: { label: 'Medium risk', tone: 'warn' },
  high: { label: 'High risk', tone: 'danger' },
};

export function ApprovalsView() {
  useTitle('Approvals');
  const { id } = useParams();
  const approvals = useApprovals();
  return (
    <div className="split">
      <section aria-labelledby="appr-h">
        <h1 id="appr-h">Approval inbox</h1>
        <p className="hint">Read-only list of mock requests. Nothing here can be approved.</p>
        <QueryState
          query={approvals}
          what="approvals"
          isEmpty={(d) => d.length === 0}
          emptyText="No approval requests."
        >
          {(list) => (
            <>
              <ul className="cards">
                {list.map((a) => (
                  <li key={a.id} aria-current={a.id === id ? 'true' : undefined}>
                    <Link to={`/approvals/${encodeURIComponent(a.id)}`}>{a.summary}</Link>
                    <div>
                      <StatusPill {...STATUS[a.status]} /> · <StatusPill {...RISK[a.risk]} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </QueryState>
      </section>
      {id ? <ApprovalDetail id={id} list={approvals} /> : null}
    </div>
  );
}

function ApprovalDetail({ id, list }: { id: string; list: ReturnType<typeof useApprovals> }) {
  const found = { ...list, data: list.data?.find((a) => a.id === id) ?? null };
  return (
    <aside aria-label="Approval details" className="panel">
      <QueryState query={found} what="approval">
        {(a) =>
          a === null ? (
            <p role="alert">Approval {id} was not found.</p>
          ) : (
            <>
              {/* DOM order follows docs/ux/accessibility.md §3: status, requester, target, risk, actions */}
              <h2>{a.summary}</h2>
              <dl>
                <dt>Status</dt>
                <dd>
                  <StatusPill {...STATUS[a.status]} />
                </dd>
                <dt>Requested by</dt>
                <dd>{a.requestedBy}</dd>
                <dt>Host</dt>
                <dd>{a.hostId ?? 'none'}</dd>
                <dt>Agent session</dt>
                <dd>{a.agentSessionId ?? 'none'}</dd>
                <dt>Risk</dt>
                <dd>
                  <StatusPill {...RISK[a.risk]} />
                </dd>
                <dt>Requested</dt>
                <dd>{formatTime(a.createdAt)}</dd>
              </dl>
              <div className="actions">
                <button type="button" disabled aria-describedby="no-auth">
                  Approve
                </button>
                <button type="button" disabled aria-describedby="no-auth">
                  Deny
                </button>
              </div>
              <p id="no-auth" className="hint">
                {NO_AUTHORITY}
              </p>
            </>
          )
        }
      </QueryState>
    </aside>
  );
}
