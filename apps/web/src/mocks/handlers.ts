import {
  API_PREFIX,
  agentSessionFixtures,
  approvalFixtures,
  hostFixtures,
  terminalSessionFixtures,
  CreateTerminalSessionRequestSchema,
  type TerminalSession,
} from '@nexus/contracts';
import { HttpResponse, http } from 'msw';

const p = (path: string) => `*${API_PREFIX}${path}`;
const notFound = (what: string) =>
  HttpResponse.json(
    { error: { code: 'not_found', message: `${what} not found` } },
    { status: 404 },
  );

/** Handlers built from packages/contracts fixtures. Every response carries dev: true. */
export function createHandlers() {
  const terminals: TerminalSession[] = [...terminalSessionFixtures].map((s) => ({ ...s }));
  return [
    http.get(p('/hosts'), () => HttpResponse.json({ dev: true, hosts: hostFixtures })),
    http.get(p('/hosts/:id'), ({ params }) => {
      const host = hostFixtures.find((h) => h.id === params['id']);
      return host ? HttpResponse.json({ dev: true, host }) : notFound('Host');
    }),
    http.get(p('/terminal-sessions'), () => HttpResponse.json({ dev: true, sessions: terminals })),
    http.post(p('/terminal-sessions'), async ({ request }) => {
      const body = CreateTerminalSessionRequestSchema.safeParse(await request.json());
      if (!body.success) {
        return HttpResponse.json(
          { error: { code: 'bad_request', message: 'Invalid request' } },
          { status: 400 },
        );
      }
      const host = hostFixtures.find((h) => h.id === body.data.hostId);
      if (!host) return notFound('Host');
      const session: TerminalSession = {
        id: `term-dev-${String(terminals.length + 1).padStart(2, '0')}`,
        hostId: host.id,
        state: 'running',
        createdAt: new Date().toISOString(),
        title: `shell · ${host.name}`,
      };
      terminals.push(session);
      return HttpResponse.json({ dev: true, session }, { status: 201 });
    }),
    http.get(p('/agent-sessions'), () =>
      HttpResponse.json({ dev: true, sessions: agentSessionFixtures }),
    ),
    http.get(p('/agent-sessions/:id'), ({ params }) => {
      const session = agentSessionFixtures.find((s) => s.id === params['id']);
      return session ? HttpResponse.json({ dev: true, session }) : notFound('Agent session');
    }),
    http.get(p('/approvals'), () => HttpResponse.json({ dev: true, approvals: approvalFixtures })),
  ];
}
