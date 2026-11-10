// Regenerates marketplace/dev-registry manifests (file hashes + digest) and index.json.
// Run: pnpm --filter @nexus/marketplace seal:dev-registry
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealPackageDir, type DraftManifest } from '../src/seal.ts';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../marketplace/dev-registry',
);

const base = {
  version: '0.1.0',
  publisher: 'nexus-samples',
  license: 'Apache-2.0',
  source: { registry: 'local-dev', ref: 'dev-fixture-1' },
} as const;
const compat = (
  harness: DraftManifest['compatibility']['harness'],
): DraftManifest['compatibility'] => ({
  nexus: '>=0.0.0 <1.0.0',
  os: ['macos', 'linux'],
  arch: ['arm64', 'x64'],
  harness,
});

const drafts: DraftManifest[] = [
  {
    ...base,
    id: 'shell-safety-skill',
    kind: 'skill',
    description: 'Text skill: review shell commands for destructive effects before running.',
    categories: ['safety', 'shell'],
    compatibility: compat(['any']),
    files: [{ path: 'SKILL.md' }],
    permissions: ['fs.read.workspace'],
  },
  {
    ...base,
    id: 'commit-message-skill',
    kind: 'skill',
    description: 'Text skill: write concise commit messages from a staged diff.',
    categories: ['git', 'writing'],
    compatibility: compat(['any']),
    files: [{ path: 'SKILL.md' }],
    permissions: ['fs.read.workspace'],
  },
  {
    ...base,
    id: 'mock-reviewer-agent',
    kind: 'agent-template',
    description: 'Mock agent template for the M-D1 mock harness: reviews a workspace diff.',
    categories: ['review', 'mock'],
    compatibility: compat(['mock']),
    files: [{ path: 'template.json' }],
    permissions: ['agent.session.start', 'fs.read.workspace'],
  },
  {
    ...base,
    id: 'mock-docs-mcp',
    kind: 'mcp-server',
    description: 'Mock MCP server descriptor (metadata only, not runnable).',
    categories: ['docs', 'mock'],
    compatibility: compat(['any']),
    files: [{ path: 'descriptor.json' }],
    permissions: ['net.egress'],
  },
  {
    ...base,
    id: 'mock-harness-adapter',
    kind: 'harness-adapter',
    description: 'Mock harness adapter descriptor (metadata only, not runnable).',
    categories: ['harness', 'mock'],
    compatibility: compat(['mock']),
    files: [{ path: 'descriptor.json' }],
    permissions: ['process.spawn'],
  },
  {
    ...base,
    id: 'solarized-night-theme',
    kind: 'terminal-extension',
    description: 'Declarative terminal colour theme.',
    categories: ['theme'],
    compatibility: compat(['any']),
    files: [{ path: 'theme.json' }],
    permissions: ['ui.theme'],
  },
];

const entries = [];
for (const d of drafts) {
  const m = await sealPackageDir(path.join(root, 'packages', d.id), d);
  entries.push({ id: m.id, version: m.version, path: `packages/${m.id}`, digest: m.digest });
}
await writeFile(
  path.join(root, 'index.json'),
  `${JSON.stringify({ registry: 'local-dev', entries }, null, 2)}\n`,
);
console.log(`sealed ${entries.length} packages`);
