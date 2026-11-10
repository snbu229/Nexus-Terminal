import type { AgentEvent, AgentSession, Approval, Host, TerminalSession } from '../schemas.js';

// Dev-only fixtures: no real addresses, hostnames or credentials.

export const hostFixtures: Host[] = [
  {
    id: 'host-dev-01',
    name: 'dev-linux-amd64-01',
    os: 'linux',
    arch: 'amd64',
    environment: 'dev',
    status: 'online',
    tags: ['sandbox', 'ubuntu'],
    terminalProvider: 'local-sandbox',
  },
  {
    id: 'host-dev-02',
    name: 'dev-linux-arm64-01',
    os: 'linux',
    arch: 'arm64',
    environment: 'dev',
    status: 'online',
    tags: ['sandbox', 'debian'],
    terminalProvider: 'ssh-dev',
  },
  {
    id: 'host-dev-03',
    name: 'dev-linux-amd64-02',
    os: 'linux',
    arch: 'amd64',
    environment: 'dev',
    status: 'offline',
    tags: ['build'],
    terminalProvider: 'ssh-dev',
  },
  {
    id: 'host-dev-04',
    name: 'dev-linux-arm64-02',
    os: 'linux',
    arch: 'arm64',
    environment: 'dev',
    status: 'unknown',
    tags: ['edge'],
    terminalProvider: 'none',
  },
  {
    id: 'host-dev-05',
    name: 'dev-mac-arm64-01',
    os: 'darwin',
    arch: 'arm64',
    environment: 'dev',
    status: 'online',
    tags: ['sandbox', 'launchd'],
    terminalProvider: 'local-sandbox',
  },
  {
    id: 'host-dev-06',
    name: 'dev-mac-arm64-02',
    os: 'darwin',
    arch: 'arm64',
    environment: 'dev',
    status: 'offline',
    tags: ['ci'],
    terminalProvider: 'none',
  },
  {
    id: 'host-dev-07',
    name: 'dev-mac-amd64-01',
    os: 'darwin',
    arch: 'amd64',
    environment: 'dev',
    status: 'online',
    tags: ['legacy'],
    terminalProvider: 'ssh-dev',
  },
  {
    id: 'host-dev-08',
    name: 'dev-mac-amd64-02',
    os: 'darwin',
    arch: 'amd64',
    environment: 'dev',
    status: 'unknown',
    tags: [],
    terminalProvider: 'none',
  },
];

export const terminalSessionFixtures: TerminalSession[] = [
  {
    id: 'term-dev-01',
    hostId: 'host-dev-01',
    state: 'running',
    createdAt: '2026-11-10T09:00:00.000Z',
    title: 'bash · dev-linux-amd64-01',
  },
  {
    id: 'term-dev-02',
    hostId: 'host-dev-05',
    state: 'exited',
    createdAt: '2026-11-10T08:30:00.000Z',
    title: 'zsh · dev-mac-arm64-01',
  },
];

export const agentSessionFixtures: AgentSession[] = [
  {
    id: 'agent-dev-01',
    harness: 'mock',
    task: 'Refactor the build script (mock)',
    state: 'running',
    continuity: 'new',
    createdAt: '2026-11-10T09:05:00.000Z',
    lastEventSeq: 3,
  },
  {
    id: 'agent-dev-02',
    harness: 'mock',
    task: 'Update the changelog (mock)',
    state: 'needs_input',
    continuity: 'reattached',
    createdAt: '2026-11-10T08:45:00.000Z',
    lastEventSeq: 4,
  },
];

export const agentEventFixtures: AgentEvent[] = [
  { seq: 1, ts: '2026-11-10T09:05:00.000Z', kind: 'status', state: 'running' },
  { seq: 2, ts: '2026-11-10T09:05:01.000Z', kind: 'output', text: 'Reading build script...' },
  {
    seq: 3,
    ts: '2026-11-10T09:05:02.000Z',
    kind: 'tool_call',
    tool: 'read_file',
    summary: 'scripts/build.sh',
  },
  {
    seq: 4,
    ts: '2026-11-10T09:05:03.000Z',
    kind: 'needs_input',
    prompt: 'Overwrite scripts/build.sh? (mock)',
  },
  { seq: 5, ts: '2026-11-10T09:06:00.000Z', kind: 'exit', code: 0 },
];

export const approvalFixtures: Approval[] = [
  {
    id: 'appr-dev-01',
    summary: 'Run package update on dev-linux-amd64-01 (mock)',
    requestedBy: 'agent-dev-01',
    hostId: 'host-dev-01',
    agentSessionId: 'agent-dev-01',
    risk: 'medium',
    status: 'pending',
    createdAt: '2026-11-10T09:10:00.000Z',
    devMock: true,
  },
  {
    id: 'appr-dev-02',
    summary: 'Restart service on dev-mac-arm64-01 (mock)',
    requestedBy: 'agent-dev-02',
    hostId: 'host-dev-05',
    agentSessionId: 'agent-dev-02',
    risk: 'low',
    status: 'pending',
    createdAt: '2026-11-10T09:12:00.000Z',
    devMock: true,
  },
  {
    id: 'appr-dev-03',
    summary: 'Delete scratch directory (mock)',
    requestedBy: 'agent-dev-02',
    hostId: null,
    agentSessionId: 'agent-dev-02',
    risk: 'high',
    status: 'expired',
    createdAt: '2026-11-10T07:00:00.000Z',
    devMock: true,
  },
];
