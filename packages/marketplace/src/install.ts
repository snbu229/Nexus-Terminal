// Install/remove state machine. "Installing" records the package and copies its verified
// declarative files into a sandbox directory. Nothing is ever executed, and there is no
// approve API in dev: pending_approval is terminal until a real approval path exists.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { MarketplaceError } from './errors.ts';
import { evaluatePolicy, OrgPolicySchema, type OrgPolicy, type PolicyDecision } from './policy.ts';
import { evaluateCompatibility, type Environment, type LocalRegistry } from './registry.ts';

export const INSTALL_STATES = [
  'available',
  'install_requested',
  'pending_approval',
  'installed',
  'remove_requested',
  'removed',
] as const;
export type InstallState = (typeof INSTALL_STATES)[number];

// Legal transitions. `available` is implicit (no record). A removed package may be re-requested.
export const TRANSITIONS: Record<InstallState, readonly InstallState[]> = {
  available: ['install_requested'],
  install_requested: ['pending_approval', 'installed'],
  pending_approval: [],
  installed: ['remove_requested'],
  remove_requested: ['removed'],
  removed: ['install_requested'],
};

const InstallRecordSchema = z
  .object({
    packageId: z.string(),
    version: z.string(),
    digest: z.string(),
    registry: z.string(),
    requester: z.string().min(1),
    state: z.enum(INSTALL_STATES),
    history: z.array(z.object({ state: z.enum(INSTALL_STATES), at: z.string() }).strict()),
    decision: z
      .object({
        decision: z.enum(['allow', 'require_approval', 'deny']),
        reasons: z.array(z.object({ code: z.string(), message: z.string() }).strict()),
      })
      .strict(),
    sandboxPath: z.string().nullable(),
  })
  .strict();
export type InstallRecord = z.infer<typeof InstallRecordSchema>;

export interface InstallStore {
  get(packageId: string): Promise<InstallRecord | undefined>;
  put(record: InstallRecord): Promise<void>;
  all(): Promise<InstallRecord[]>;
}

export class MemoryInstallStore implements InstallStore {
  private readonly records = new Map<string, InstallRecord>();
  async get(id: string) {
    const r = this.records.get(id);
    return r && structuredClone(r);
  }
  async put(record: InstallRecord) {
    this.records.set(record.packageId, structuredClone(record));
  }
  async all() {
    return [...this.records.values()].map((r) => structuredClone(r));
  }
}

/** JSON file store (intended for a temp dir). Loaded content is re-validated strictly. */
export class JsonFileInstallStore implements InstallStore {
  constructor(private readonly file: string) {}

  private async read(): Promise<InstallRecord[]> {
    let text: string;
    try {
      text = await readFile(this.file, 'utf8');
    } catch {
      return [];
    }
    const parsed = z.array(InstallRecordSchema).safeParse(JSON.parse(text));
    if (!parsed.success)
      throw new MarketplaceError('invalid_state_file', 'install state file is invalid');
    return parsed.data;
  }
  async get(id: string) {
    return (await this.read()).find((r) => r.packageId === id);
  }
  async put(record: InstallRecord) {
    const next = (await this.read()).filter((r) => r.packageId !== record.packageId);
    next.push(record);
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, this.file);
  }
  async all() {
    return this.read();
  }
}

function containsApprovedFlag(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsApprovedFlag);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(
      ([k, v]) => k.toLowerCase().replace(/[^a-z]/g, '') === 'approved' || containsApprovedFlag(v),
    );
  }
  return false;
}

function parseRequest<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  if (containsApprovedFlag(input)) {
    throw new MarketplaceError('approved_flag_rejected', 'input must not carry an approved flag');
  }
  const r = schema.safeParse(input);
  if (!r.success)
    throw new MarketplaceError('invalid_request', r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}

const actor = z.string().trim().min(1).max(128);
const InstallRequestSchema = z
  .object({ packageId: z.string().min(1), version: z.string().optional(), requester: actor })
  .strict();
const RemoveRequestSchema = z.object({ packageId: z.string().min(1), requester: actor }).strict();
const ApprovalAttemptSchema = z.object({ packageId: z.string().min(1), approver: actor }).strict();

export type InstallManagerOptions = {
  registry: LocalRegistry;
  policy: OrgPolicy;
  env: Environment;
  sandboxRoot: string;
  store?: InstallStore;
  now?: () => Date;
};

export class InstallManager {
  private readonly registry: LocalRegistry;
  private readonly policy: OrgPolicy;
  private readonly env: Environment;
  private readonly sandboxRoot: string;
  private readonly store: InstallStore;
  private readonly now: () => Date;

  constructor(opts: InstallManagerOptions) {
    this.registry = opts.registry;
    this.policy = OrgPolicySchema.parse(opts.policy);
    this.env = opts.env;
    this.sandboxRoot = path.resolve(opts.sandboxRoot);
    this.store = opts.store ?? new MemoryInstallStore();
    this.now = opts.now ?? (() => new Date());
  }

  async list(): Promise<InstallRecord[]> {
    return this.store.all();
  }

  async get(packageId: string): Promise<InstallRecord | undefined> {
    return this.store.get(packageId);
  }

  private async transition(rec: InstallRecord, to: InstallState): Promise<void> {
    if (!TRANSITIONS[rec.state].includes(to)) {
      throw new MarketplaceError('invalid_transition', `${rec.state} -> ${to} is not allowed`);
    }
    rec.state = to;
    rec.history.push({ state: to, at: this.now().toISOString() });
    await this.store.put(rec);
  }

  async requestInstall(input: unknown): Promise<InstallRecord> {
    const req = parseRequest(InstallRequestSchema, input);
    const existing = await this.store.get(req.packageId);
    if (existing && existing.state !== 'removed') {
      throw new MarketplaceError(
        'invalid_transition',
        `${req.packageId} is already ${existing.state}`,
      );
    }

    // Everything below happens before any state is recorded; failures leave no record.
    const { manifest, files } = await this.registry.fetch(req.packageId, req.version);
    const compat = evaluateCompatibility(manifest, this.env);
    if (!compat.compatible) {
      throw new MarketplaceError('incompatible', compat.reasons.join('; '), compat.reasons);
    }
    const decision: PolicyDecision = evaluatePolicy(this.policy, manifest);
    if (decision.decision === 'deny') {
      throw new MarketplaceError(
        'policy_denied',
        decision.reasons.map((r) => r.message).join('; '),
        decision,
      );
    }

    const rec: InstallRecord = {
      packageId: manifest.id,
      version: manifest.version,
      digest: manifest.digest,
      registry: manifest.source.registry,
      requester: req.requester,
      state: 'available',
      history: [],
      decision,
      sandboxPath: null,
    };
    await this.transition(rec, 'install_requested');
    if (decision.decision === 'require_approval') {
      await this.transition(rec, 'pending_approval');
      return rec;
    }

    const target = path.join(this.sandboxRoot, manifest.id, manifest.version);
    try {
      for (const [rel, data] of files) {
        const dest = path.join(target, ...rel.split('/'));
        if (!dest.startsWith(target + path.sep)) {
          throw new MarketplaceError('unsafe_path', `escapes sandbox: ${rel}`);
        }
        await mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
        await writeFile(dest, data, { flag: 'wx', mode: 0o600 });
      }
    } catch (err) {
      await rm(target, { recursive: true, force: true });
      throw err;
    }
    rec.sandboxPath = target;
    await this.transition(rec, 'installed');
    return rec;
  }

  async requestRemove(input: unknown): Promise<InstallRecord> {
    const req = parseRequest(RemoveRequestSchema, input);
    const rec = await this.store.get(req.packageId);
    if (!rec || rec.state !== 'installed') {
      throw new MarketplaceError('not_installed', `${req.packageId} is not installed`);
    }
    await this.transition(rec, 'remove_requested');
    if (rec.sandboxPath) await rm(rec.sandboxPath, { recursive: true, force: true });
    rec.sandboxPath = null;
    await this.transition(rec, 'removed');
    return rec;
  }

  /**
   * Dev stub: there is no approval path. It exists so callers get a precise refusal; it never
   * changes state. Self-approval is reported distinctly so the rule stays testable once a real
   * (human, board-gated) approval flow replaces it.
   */
  async attemptApproval(input: unknown): Promise<never> {
    const req = parseRequest(ApprovalAttemptSchema, input);
    const rec = await this.store.get(req.packageId);
    if (!rec || rec.state !== 'pending_approval') {
      throw new MarketplaceError('invalid_transition', `${req.packageId} is not pending approval`);
    }
    if (req.approver.toLowerCase() === rec.requester.toLowerCase()) {
      throw new MarketplaceError('self_approval', 'the requester cannot approve their own request');
    }
    throw new MarketplaceError(
      'approval_unavailable',
      'approval is not available in the dev marketplace',
    );
  }
}
