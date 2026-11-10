import {
  agentSessionFixtures,
  approvalFixtures,
  API_PREFIX,
  hostFixtures,
  terminalSessionFixtures,
} from '@nexus/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../src/mocks/server';
import { expectNoA11yViolations, renderApp } from './helpers';

const url = (p: string) => `*${API_PREFIX}${p}`;
const empty = (path: string, key: string) =>
  server.use(http.get(url(path), () => HttpResponse.json({ dev: true, [key]: [] })));
const fail = (path: string) =>
  server.use(
    http.get(url(path), () =>
      HttpResponse.json({ error: { code: 'boom', message: 'Mock failure' } }, { status: 500 }),
    ),
  );
const hang = (path: string) => server.use(http.get(url(path), () => delay('infinite')));

describe('app shell', () => {
  it('labels the banner with the running API mode', () => {
    renderApp('/', 'real');
    expect(screen.getByRole('region', { name: 'Development build' })).toHaveTextContent(
      'Development build, no authentication, local API',
    );
    expect(screen.getByRole('region', { name: 'Development build' })).not.toHaveTextContent(
      'mock data',
    );
  });

  it('shows the dev banner, landmarks and nav in a stable order', async () => {
    const { container } = renderApp('/');
    expect(screen.getByRole('region', { name: 'Development build' })).toHaveTextContent(
      'Development build, no authentication, mock data',
    );
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Servers', 'Terminals', 'Agents', 'Approvals']);
    expect(screen.getByRole('main')).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Servers', level: 1 });
    await expectNoA11yViolations(container);
  });

  it('puts the skip link first in focus order and sets a route title', async () => {
    renderApp('/agents');
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus();
    await waitFor(() => expect(document.title).toBe('Agent sessions - Nexus'));
  });
});

describe('servers view', () => {
  it('lists hosts with OS/arch/status/tags', async () => {
    const { container } = renderApp('/servers');
    const table = await screen.findByRole('table', { name: 'Server inventory' });
    expect(within(table).getAllByRole('row')).toHaveLength(hostFixtures.length + 1);
    const row = within(table).getByRole('row', { name: /dev-mac-arm64-01/ });
    expect(row).toHaveTextContent('macOS arm64');
    expect(row).toHaveTextContent('Reachable');
    expect(row).toHaveTextContent('sandbox, launchd');
    await expectNoA11yViolations(container);
  });

  it('filters by search text and status', async () => {
    renderApp('/servers');
    await screen.findByRole('table');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search servers' }), 'macos');
    expect(screen.getByText('4 of 8 servers')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'online');
    expect(screen.getByText('2 of 8 servers')).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No servers match your filters.')).toBeInTheDocument();
  });

  it('shows detail with an enabled Open terminal for an online host and creates a session', async () => {
    const { container } = renderApp('/servers/host-dev-01');
    const detail = await screen.findByRole('complementary', { name: 'Server details' });
    await within(detail).findByRole('heading', { name: 'dev-linux-amd64-01' });
    const btn = within(detail).getByRole('button', { name: /Open terminal on dev-linux-amd64-01/ });
    expect(btn).toBeEnabled();
    await expectNoA11yViolations(container);
    await userEvent.click(btn);
    await screen.findByRole('heading', { name: 'Terminal sessions' });
    expect(
      await screen.findByRole('link', { name: /shell · dev-linux-amd64-01/ }),
    ).toBeInTheDocument();
  });

  it('disables Open terminal with a reason for offline or provider-less hosts', async () => {
    renderApp('/servers/host-dev-03');
    const btn = await screen.findByRole('button', { name: /Open terminal/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription('The server is not reachable.');
  });

  it('renders empty, error and loading states', async () => {
    empty('/hosts', 'hosts');
    const a = renderApp('/servers');
    expect(await screen.findByText('No servers yet.')).toBeInTheDocument();
    await expectNoA11yViolations(a.container);
    a.unmount();

    fail('/hosts');
    const b = renderApp('/servers');
    expect(await screen.findByRole('alert')).toHaveTextContent('Mock failure');
    await expectNoA11yViolations(b.container);
    b.unmount();

    hang('/hosts');
    const c = renderApp('/servers');
    expect(screen.getByRole('status')).toHaveTextContent('Loading servers');
    await expectNoA11yViolations(c.container);
  });

  it('reports an unknown host as an error', async () => {
    renderApp('/servers/nope');
    expect(await screen.findByText(/Could not load server\. Host not found/)).toBeInTheDocument();
  });
});

describe('terminal sessions view', () => {
  it('lists several sessions as tabs and shows the placeholder pane', async () => {
    const { container } = renderApp('/terminals/term-dev-01');
    const tabs = await screen.findByRole('navigation', { name: 'Terminal sessions' });
    expect(within(tabs).getAllByRole('link')).toHaveLength(terminalSessionFixtures.length);
    expect(within(tabs).getByRole('link', { current: 'page' })).toHaveTextContent('Live');
    expect(within(tabs).getByRole('link', { name: /zsh · dev-mac-arm64-01/ })).toHaveTextContent(
      'Exited',
    );
    expect(await screen.findByText(/placeholder/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('prompts to select a tab when none is active', async () => {
    renderApp('/terminals');
    expect(await screen.findByText('Select a session tab.')).toBeInTheDocument();
  });

  it('renders empty, error and loading states', async () => {
    empty('/terminal-sessions', 'sessions');
    const a = renderApp('/terminals');
    expect(await screen.findByText(/No open terminal sessions/)).toBeInTheDocument();
    await expectNoA11yViolations(a.container);
    a.unmount();
    fail('/terminal-sessions');
    const b = renderApp('/terminals');
    expect(await screen.findByRole('alert')).toHaveTextContent('Mock failure');
    await expectNoA11yViolations(b.container);
    b.unmount();
    hang('/terminal-sessions');
    const c = renderApp('/terminals');
    expect(screen.getByRole('status')).toHaveTextContent('Loading terminal sessions');
    await expectNoA11yViolations(c.container);
  });
});

describe('agent sessions view', () => {
  it('lists sessions with state, continuity label and seq', async () => {
    const { container } = renderApp('/agents');
    const item = (await screen.findByRole('link', { name: /Update the changelog/ })).closest('li')!;
    expect(item).toHaveTextContent('Needs input');
    expect(item).toHaveTextContent('Reattached (same process)');
    expect(item).toHaveTextContent(`seq ${agentSessionFixtures[1]!.lastEventSeq}`);
    expect(screen.getByText(/New session/)).toBeInTheDocument();
    expect(screen.queryByText(/Resumed/)).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows detail with the event log up to lastEventSeq', async () => {
    const { container } = renderApp('/agents/agent-dev-01');
    const log = await screen.findByRole('list', { name: 'Agent events' });
    expect(within(log).getAllByRole('listitem')).toHaveLength(3);
    expect(log).toHaveTextContent('read_file: scripts/build.sh');
    expect(log).not.toHaveTextContent('needs_input');
    expect(screen.getByText('Event stream: Live')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('labels a resumed session as resumed, not reattached', async () => {
    server.use(
      http.get(url('/agent-sessions'), () =>
        HttpResponse.json({
          dev: true,
          sessions: [{ ...agentSessionFixtures[0]!, continuity: 'resumed' }],
        }),
      ),
    );
    renderApp('/agents');
    expect(await screen.findByText(/Resumed \(from checkpoint\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Reattached/)).not.toBeInTheDocument();
  });

  it('renders empty, error and loading states', async () => {
    empty('/agent-sessions', 'sessions');
    const a = renderApp('/agents');
    expect(await screen.findByText('No agent sessions.')).toBeInTheDocument();
    await expectNoA11yViolations(a.container);
    a.unmount();
    fail('/agent-sessions');
    const b = renderApp('/agents');
    expect(await screen.findByRole('alert')).toHaveTextContent('Mock failure');
    await expectNoA11yViolations(b.container);
    b.unmount();
    hang('/agent-sessions');
    const c = renderApp('/agents');
    expect(screen.getByRole('status')).toHaveTextContent('Loading agent sessions');
    await expectNoA11yViolations(c.container);
  });
});

describe('approval inbox view', () => {
  it('lists approvals read-only', async () => {
    const { container } = renderApp('/approvals');
    await screen.findByRole('link', { name: /Run package update/ });
    expect(within(screen.getByRole('main')).getAllByRole('listitem')).toHaveLength(
      approvalFixtures.length,
    );
    expect(screen.getByText(/Nothing here can be approved/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows detail with Approve/Deny disabled and labelled dev mock: no authority', async () => {
    const { container } = renderApp(`/approvals/${approvalFixtures[0]!.id}`);
    const detail = await screen.findByRole('complementary', { name: 'Approval details' });
    for (const name of ['Approve', 'Deny']) {
      const b = await within(detail).findByRole('button', { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription('dev mock: no authority');
    }
    expect(detail).toHaveTextContent('Medium risk');
    await expectNoA11yViolations(container);
  });

  it('shows expired status', async () => {
    renderApp('/approvals/appr-dev-03');
    const detail = await screen.findByRole('complementary');
    expect(await within(detail).findByRole('heading', { level: 2 })).toHaveTextContent(
      'Delete scratch',
    );
    expect(detail).toHaveTextContent('Expired');
  });

  it('reports an unknown approval id', async () => {
    renderApp('/approvals/nope');
    expect(await screen.findByText('Approval nope was not found.')).toBeInTheDocument();
  });

  it('renders empty, error and loading list states', async () => {
    empty('/approvals', 'approvals');
    const a = renderApp('/approvals');
    expect(await screen.findByText('No approval requests.')).toBeInTheDocument();
    await expectNoA11yViolations(a.container);
    a.unmount();
    fail('/approvals');
    const b = renderApp('/approvals');
    expect(await screen.findByRole('alert')).toHaveTextContent('Mock failure');
    await expectNoA11yViolations(b.container);
    b.unmount();
    hang('/approvals');
    const c = renderApp('/approvals');
    expect(screen.getByRole('status')).toHaveTextContent('Loading approvals');
    await expectNoA11yViolations(c.container);
  });
});
