import { z } from 'zod';
import type { Manifest } from './manifest.ts';
import { PERMISSIONS, PermissionSchema, type Permission } from './permissions.ts';

export const PermissionActionSchema = z.enum(['allow', 'require_approval', 'deny']);
export type PermissionAction = z.infer<typeof PermissionActionSchema>;

export const OrgPolicySchema = z
  .object({
    allowedRegistries: z.array(z.string()),
    allowedPublishers: z.array(z.string()),
    // Permissions missing from this map are denied (fail closed).
    permissions: z.partialRecord(PermissionSchema, PermissionActionSchema),
  })
  .strict();
export type OrgPolicy = z.infer<typeof OrgPolicySchema>;

export type PolicyDecision = {
  decision: PermissionAction;
  reasons: { code: string; message: string }[];
};

const RANK: Record<PermissionAction, number> = { allow: 0, require_approval: 1, deny: 2 };

export function evaluatePolicy(policyInput: unknown, manifest: Manifest): PolicyDecision {
  const policy = OrgPolicySchema.parse(policyInput);
  let decision: PermissionAction = 'allow';
  const reasons: PolicyDecision['reasons'] = [];
  const raise = (to: PermissionAction, code: string, message: string) => {
    if (RANK[to] > RANK[decision]) decision = to;
    reasons.push({ code, message });
  };

  if (!policy.allowedRegistries.includes(manifest.source.registry)) {
    raise('deny', 'registry_not_allowed', `registry ${manifest.source.registry} is not allowed`);
  }
  if (!policy.allowedPublishers.includes(manifest.publisher)) {
    raise('deny', 'publisher_not_allowed', `publisher ${manifest.publisher} is not allowed`);
  }
  for (const p of manifest.permissions) {
    const action = policy.permissions[p] ?? 'deny';
    if (action === 'deny') raise('deny', 'permission_denied', `permission ${p} is denied`);
    else if (action === 'require_approval') {
      raise(
        'require_approval',
        'permission_requires_approval',
        `permission ${p} requires approval`,
      );
    }
  }
  if (reasons.length === 0) reasons.push({ code: 'allowed', message: 'all checks passed' });
  return { decision, reasons };
}

/** Conservative default for the dev registry: low-risk allowed, high-risk gated, critical denied. */
export const DEV_DEFAULT_POLICY: OrgPolicy = {
  allowedRegistries: ['local-dev'],
  allowedPublishers: ['nexus-samples'],
  permissions: Object.fromEntries(
    PERMISSIONS.map((p): [Permission, PermissionAction] => [
      p,
      p === 'secrets.read' || p === 'host.ssh'
        ? 'deny'
        : ['net.egress', 'process.spawn', 'terminal.input'].includes(p)
          ? 'require_approval'
          : 'allow',
    ]),
  ),
};
