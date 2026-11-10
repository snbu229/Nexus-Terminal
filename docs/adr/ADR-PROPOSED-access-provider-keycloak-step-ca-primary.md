# ADR (proposed): Keycloak + step-ca as the primary access architecture; Teleport as an optional external integration

Status: **Proposed. Provisional CEO business decision (2026-11-10, reconfirmed by the CEO the same day). Not legal clearance.** This ADR touches authentication and authorization, so it needs C1 by A5 QA & Security and a recorded human board C2 before it is accepted. At C2 the board acknowledges **two spec deviations** (see Consequences).
Origin: EZF-24 (NX2-005a, human legal review, question Q2); plan EZF-2 decision D3 and risk R1; access provider evaluation EZF-7 (`docs/research/access-provider-evaluation.md`); licence ledger EZF-5 finding F6.
Depends on: PR #4 (EZF-5 licence ledger). The ledger paths and finding IDs cited here exist only on that branch until it merges, so PR #4 must merge before this ADR.
Author: A1 Nexus CTO / Research Architect.

## Context

Teleport Community Edition binaries (v16 and later) are under a commercial licence. Use is allowed only for organisations below 100 employees **and** below US$10M annual revenue, with no resale or embedding in products or services (ledger F6). Teleport source is AGPL-3.0. Decision D3 needed the company's eligibility before Teleport CE could be chosen.

The EZF-7 evaluation (draft, not a decision) recommended Teleport CE as the Phase-1 access provider, conditional on the board confirming eligibility. Its hands-on tests T-01..T-19 have not run (tracked in EZF-20).

On 2026-11-10 the CEO (Sandeep Reddy) answered EZF-24 Q2:

- (a) Eligibility is **not confirmed**. The board will check the operating legal entity's employee count and annual revenue against the CE terms. Until then, eligibility must not be assumed.
- (b) Nexus may document Teleport as an optional third-party integration and link to Teleport's official installation documentation, under the restrictions below.
- Architecture decision: use Keycloak + step-ca and appropriately licensed SSH components as the primary open-source identity and access architecture. Keep Teleport as an optional external integration, subject to licensing approval. Continue research and development without depending on Teleport CE eligibility.

## Decision

1. **Primary access path:** Keycloak (Apache-2.0) for identity brokering (GitHub login), step-ca (Apache-2.0) for short-lived SSH user and host certificates, and OpenSSH (`SSH-OpenSSH`) on hosts. All three are `adopt` in the licence ledger. GitHub team-to-role mapping is done by a Nexus-owned mapper or sync service, not by Keycloak out of the box (see Consequences).
2. **Teleport is optional and external, subject to licensing approval.** Nexus keeps the `AccessProvider` abstraction (plan R1). A Teleport provider may be built only after the board confirms CE eligibility (or a commercial licence is approved), and only as an integration with an operator-installed Teleport, reached through documented APIs/CLIs (the Apache-2.0 `api` module). The same eligibility gate applies to **any internal use of CE by the company**, including lab tests that run CE (EZF-20 T-11, T-19 and the other Teleport tests). Ledger outcome `teleport = external-service-only` is unchanged.
3. Restrictions on Teleport, from the decision-maker:
   - Do not bundle or redistribute Teleport CE binaries or container images.
   - Do not install Teleport CE automatically or embed it in Nexus Terminal.
   - Do not make Teleport a mandatory dependency.
   - Do not assume that documentation-only distribution or an optional integration automatically satisfies the CE licence.
   - Request legal review or written clarification from Teleport before offering a tightly integrated or automated CE installation experience.
4. Nexus docs may link to Teleport's official installation documentation and must state the vendor's CE terms (ledger §6). Use of the Teleport name follows the trademark conditions from EZF-24 Q4 (factual, nominative use only; no implied endorsement; no logos without permission).

## Consequences

### Spec deviations (board acknowledges at C2)

`TELEPORT_IDENTITY_ACCESS.md` "Recommended strategy" puts Teleport CE in Phase 1 and Keycloak only in Phase 2 ("if strictly open-source-only is mandatory"). It also says: "Do not build your own SSH CA or access broker until threat-model review proves need", and "do not claim that Keycloak by itself replaces Teleport SSH enforcement". This ADR deviates twice:

1. **Phase order reversed.** Keycloak + step-ca becomes the primary path; Teleport becomes optional.
2. **Nexus builds an access broker.** This path needs Nexus-owned broker code: GitHub team-to-principal mapping, per-host and label policy, the JIT request state machine and approval-gated certificate issuance (EZF-7 §2). The justification is **licensing** (CE eligibility unconfirmed, embedding ban), **not** a threat-model result showing need. EZF-7 §2 already records that this path contradicts the guidance.

What stays inside the spec: step-ca is an existing, maintained CA, so Nexus does not build its own CA. Keycloak is never claimed to enforce SSH; OpenSSH on the host does. The spec's Teleport-*style* requirements (short-lived certificates, GitHub team mapping, deny by default, approval for production elevation, audit, detaching Nexus-controlled streams on revocation) still apply in full. GitHub repository access never implies SSH role authorization.

A0 logs both deviations in the spec erratum for the "Recommended strategy" section once this ADR is accepted.

### The SSH trust boundary moves into Nexus

In the Teleport path, Teleport is the SSH source of truth, and the Nexus approval ledger must not bypass it (EZF-7 §4, §6). In this path the Nexus broker decides what step-ca signs, so **the Nexus control plane becomes the SSH authorization authority**, and a broker compromise means certificates get issued. Therefore:

- (a) The broker and the step-ca provisioner credentials are a separate security domain. No AI or agent principal can reach the issuance path, consistent with the rule that autonomous agents never get production root.
- (b) step-ca and its CA keys run as an operator-managed service apart from the Nexus control plane. Nexus never holds CA or root keys (EZF-7 T10).
- (c) Production issuance requires the human approval rules (two distinct humans, never the requester), **enforced by the broker before signing**. The approval ledger therefore now *grants* SSH, and this change in its role is explicit.
- (d) The `AccessProvider` contract ("the provider is the source of truth for SSH") is redefined for this provider in the A5 threat model.

### Mandatory A5 threat-model gate before any broker code

No broker or host-enrolment code starts until A5 completes a threat model for this path. Its scope includes the trust boundary above and, as host-contract inputs at minimum:

- Principals encode roles, not personal usernames. Hosts use `AuthorizedPrincipalsFile` or `AuthorizedPrincipalsCommand` per login. `TrustedUserCAKeys` alone is not enough.
- `root` is never a principal, and `PermitRootLogin no` is set (EZF-7 T14 for agent principals).
- The step-ca OIDC provisioner `admins` list is empty or a named human break-glass list, because `admins` may request certificates with arbitrary principals. `domains`, client ID and audience are restricted. The certificate template is reviewed.
- Host certificates are used with `@cert-authority` in `known_hosts`, so first connections are not trust-on-first-use.
- Password authentication is off, and `authorized_keys` is audited at enrolment (EZF-7 T8).
- **Revocation:** step-ca SSH revocation is passive, so relying on certificate TTL alone gives an exposure window equal to the TTL. That is a design choice, not inherent: the threat model evaluates host-side revocation with OpenSSH `RevokedKeys` (KRL) distributed by the operator or Nexus. TTL values stay a board decision (EZF-7 §8, item 4).

### What Nexus must build (engineering cost)

EZF-7 rates this path's engineering cost as the **highest** of the three options, and the M-plan must account for it. Nexus-built items: GitHub team-to-group mapper or sync service (EZF-7 marks this **[inferred]**), per-host and label authorization, the JIT request state machine, dual authorization for production, session recording and audit, per-connection MFA enforcement, host CA rotation, and the revocation mechanism chosen above. Offboarding removes the user in Keycloak; existing certificates live until expiry unless a KRL is used.

### Effect on EZF-7 and EZF-20

- **The EZF-7 recommendation is superseded.** Teleport CE is no longer the Phase-1 provider. `access-provider-evaluation.md` §4 (last bullet), §8 (item 1) and §10 ("not yet adopted") become stale. A1 adds a "superseded by this ADR" note to that document in the change that marks this ADR accepted.
- **Accepting this ADR does not satisfy the EZF-7 gate "tested identity/revocation workflow".** It stays blocked on EZF-20.
- **EZF-20 (T-01..T-19) is titled "Teleport + GitHub" and needs re-planning** by A8 Identity and A0, so the primary path is tested against Keycloak + step-ca. The re-plan adds step-ca-specific tests at minimum: principal derivation and the `admins` arbitrary-principal bypass; step-ca outage (the T-19 analogue: no fallback to direct SSH or cached keys); provisioner misconfiguration; host-certificate MITM; and isolation of the issuance path from agent principals. Teleport tests become optional-integration tests and run only after the board confirms CE eligibility. The re-plan is not done in this ADR.
- Decision D3 is answered for architecture purposes. The CE eligibility fact itself stays open on EZF-24 and gates both the optional Teleport provider and any internal CE use.

## Alternatives considered

| Option | Why not chosen now |
|---|---|
| Teleport CE as primary (EZF-7 recommendation) | Eligibility not confirmed; embedding ban; makes the product depend on a non-OSI licence. |
| Teleport Enterprise | Commercial contract, cost unknown, likely above the USD 300/month cap. Not approved. |
| Build an SSH CA without step-ca | More Nexus-owned security code with no licence benefit. step-ca is Apache-2.0. |

## Open items (tracked on EZF-24)

- Board confirms or rejects Teleport CE eligibility for the operating legal entity.
- Qualified counsel and the authorized signatory or board confirm the Teleport restrictions above.
- Before any tightly integrated or automated CE install flow: legal review or written clarification from Teleport.
- A5 threat model for this path (gate before broker code).
