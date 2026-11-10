import { z } from 'zod';

// Closed permission enum (proposed in docs/adr/0001-marketplace-package-model.md).
// Adding a permission is a schema change reviewed under the ADR; packages cannot invent new ones.
export const PERMISSIONS = [
  'ui.theme',
  'ui.keymap',
  'fs.read.workspace',
  'fs.write.workspace',
  'agent.session.start',
  'terminal.output.read',
  'terminal.input',
  'net.egress',
  'process.spawn',
  'secrets.read',
  'host.ssh',
] as const;

export const PermissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof PermissionSchema>;

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const PERMISSION_RISK: Record<Permission, RiskLevel> = {
  'ui.theme': 'low',
  'ui.keymap': 'low',
  'fs.read.workspace': 'low',
  'fs.write.workspace': 'medium',
  'agent.session.start': 'medium',
  'terminal.output.read': 'medium',
  'terminal.input': 'high',
  'net.egress': 'high',
  'process.spawn': 'high',
  'secrets.read': 'critical',
  'host.ssh': 'critical',
};

export function maxRisk(permissions: readonly Permission[]): RiskLevel {
  let best = 0;
  for (const p of permissions) best = Math.max(best, RISK_LEVELS.indexOf(PERMISSION_RISK[p]));
  return RISK_LEVELS[best] ?? 'low';
}
