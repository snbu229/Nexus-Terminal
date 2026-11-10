# ADR (proposed): build the Nexus approval inbox; Happier is the reference, HAPI is behaviour-only

Status: **Proposed.** Needs C1 (A5) and C2 (A0).
Origin: EZF-13 (NX3-106, absorbs NX2-003). Evidence: `docs/research/component-comparison.md` §4.
Author: A1 Nexus CTO / Research Architect.

## Context

Nexus must let a user approve agent tool calls and production actions from any device. Two projects already do this:

- **Happier** (MIT, HEAD `7b37d65ca75e`, no stable release tag yet): an attention inbox across machines, push that deep-links to the session, an E2EE relay, iOS/Android/web/desktop apps, and ACP agents.
- **HAPI** (AGPL-3.0-only, v0.34.5): a self-run hub with SQLite, a REST and SSE client API, and a PWA plus paid native apps.

Findings from their docs (research doc §4.1):

- **H-1.** HAPI authenticates every client with one shared token.
- **H-2.** HAPI namespaces are token suffixes, which isolate but do not authorize.
- **H-3.** HAPI agents can spawn or wake peer sessions by default.
- **P-1.** Happier "account pools" rotate model-provider accounts.
- **P-2.** Happier's relay cannot read approvals, by design.
- **P-3.** Happier offers public read-only session links.
- Both offer voice-driven approval.

## Decision

1. **Build** the Nexus approval inbox and agent session view on ACP `request_permission` plus the Nexus policy engine. Each decision is bound to `(approval_id, plan_hash, nonce)` and gated by SSO, MFA and step-up. Production actions need two distinct humans and allow no self-approval. Push payloads carry no sensitive content and no executable action.
2. **Happier is the primary UX reference** (MIT). An optional Happier integration for personal, non-production agent sessions is **deferred to R2**.
3. **HAPI is behaviour reference only.** No code, assets or protocol fixtures are copied (AGPL, ledger `reject`).
4. Nexus will **not** implement account-pool rotation, public session links or voice approval above low risk.
5. R1 mobile is the PWA with ntfy. Native store apps are a later board and budget decision.

## Consequences

- E2EE of transcripts stays possible. Approvals and plans must remain server-readable for policy and audit.
- Lab test P-4 benchmarks time-to-approve and payload contents against a self-hosted Happier relay.

## Alternatives considered

- Adopt Happier as the Nexus agent front end. Rejected: its personal-account identity model and an E2EE relay that cannot read approvals are incompatible with org RBAC, dual approval and audit.
