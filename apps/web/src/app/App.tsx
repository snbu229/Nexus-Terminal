import { Navigate, Route, Routes } from 'react-router';
import { AgentsView } from '../views/AgentsView';
import { ApprovalsView } from '../views/ApprovalsView';
import { ServersView } from '../views/ServersView';
import { TerminalsView } from '../views/TerminalsView';
import { Shell } from './Shell';

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/servers" replace />} />
        <Route path="servers/:id?" element={<ServersView />} />
        <Route path="terminals/:id?" element={<TerminalsView />} />
        <Route path="agents/:id?" element={<AgentsView />} />
        <Route path="approvals/:id?" element={<ApprovalsView />} />
        <Route path="*" element={<p role="alert">Page not found.</p>} />
      </Route>
    </Routes>
  );
}
