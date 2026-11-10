# ADR (proposed): Keycloak + step-ca as the primary access architecture; Teleport as an optional external integration

Status: **Proposed. Provisional CEO business decision (2026-11-10). Not legal clearance.** This ADR touches authentication and authorization, so it needs C1 by A5 QA & Security and a recorded human board C2 before it is accepted.
Origin: EZF-24 (NX2-005a, human legal review, question Q2); plan EZF-2 decision D3 and risk R1; access provider evaluation EZF-7 (`docs/research/access-provider-evaluation.md`); licence ledger EZF-5 finding F6.
Author: A1 Nexus CTO / Research Architect.

## Context

Teleport Community Edition binaries (v16 and later) are under a commercial licence. Use is allowed only for organisations below 100 employees **and** below US$10M annual revenue, with no resale or embedding in products or services (ledger F6). Teleport source is AGPL-3.0. Decision D3 needed the company's eligibility before Teleport CE could be chosen.

The EZF-7 evaluation (draft, not a decision) recommended Teleport CE as the Phase-1 access provider, conditional on the board confirming eligibility. Its hands-on tests T-01..T-19 have not run (tracked in EZF-20).

On 2026-11-10 the CEO (Sandeep Reddy) answered EZF-24 Q2:

- (a) Eligibility is **not confirmed**. The board will check the operating legal entity's employee count and annual revenue against the CE terms. Until then, eligibility must not be assumed.
- (b) Nexus may document Teleport as an optional third-party integration and link to Teleport's official installation documentation, under the restrictions below.
- Architecture decision: use Keycloak + step-ca and appropriately licensed SSH components as the primary open-source identity and access architecture. Keep Teleport as an optional external integration, subject to licensing approval. Continue research and development without depending on Teleport CE eligibility.

## Decision

1. **Primary access path:** Keycloak (Apache-2.0) for identity brokering (GitHub login, team-to-role mapping) and step-ca (Apache-2.0) for short-lived SSH user certificates, with OpenSSH (`SSH-OpenSSH`) on hosts. All three are `adopt` in the licence ledger.
2. **Teleport is optional and external.** Nexus keeps the `AccessProvider` abstraction (plan R1). A Teleport provider may exist only as an integration with an operator-installed Teleport, reached through documented APIs/CLIs (the Apache-2.0 `api` module). Ledger outcome `teleport = external-service-only` is unchanged.
3. Restrictions on Teleport, from the decision-maker:
   - Do not bundle or redistribute Teleport CE binaries or container images.
   - Do not install Teleport CE automatically or embed it in Nexus Terminal.
   - Do not make Teleport a mandatory dependency.
   - Do not assume that documentation-only distribution or an optional integration automatically satisfies the CE licence.
   - Request legal review or written clarification from Teleport before offering a tightly integrated or automated CE installation experience.
4. Nexus docs may link to Teleport's official installation documentation and must state the vendor's CE terms (ledger §6). Use of the Teleport name follows the trademark conditions from EZF-24 Q4 (factual, nominative use only; no implied endorsement; no logos without permission).

## Consequences

- **The EZF-7 recommendation is superseded.** Teleport CE is no longer the Phase-1 provider. EZF-7 §2 capability gaps for Keycloak + step-ca now become primary-path work. This includes GitHub team-to-group mapping, which EZF-7 marks **[inferred]** as needing a custom mapper or a GitHub API sync service (Nexus-owned code), plus offboarding by certificate TTL only, and dual authorization being Nexus-built.
- **EZF-20 (T-01..T-19) is titled "Teleport + GitHub".** Its scope needs re-planning so the primary path is tested against Keycloak + step-ca. Teleport tests become optional-integration tests. A8 Identity and A0 own that re-plan. It is not done in this ADR.
- **Revocation:** step-ca issues certificates that live until expiry. The exposure window equals the certificate TTL. TTL values stay a board decision (EZF-7 §8, item 4).
- **Spec deviation (needs C2 acknowledgement).** `TELEPORT_IDENTITY_ACCESS.md` "Recommended strategy" puts Teleport CE in Phase 1 and Keycloak only in Phase 2 ("if strictly open-source-only is mandatory"). It also says: "Do not build your own SSH CA or access broker until threat-model review proves need", and "do not claim that Keycloak by itself replaces Teleport SSH enforcement". This ADR reverses the phase order. To stay inside the spec's other rules:
  - SSH enforcement is done by OpenSSH on the host (`TrustedUserCAKeys` / principals from step-ca certificates). It is never done by Keycloak alone.
  - step-ca is an existing, maintained CA, not a Nexus-built one. The glue between Keycloak, GitHub teams and step-ca (the broker part) *is* Nexus-owned security code. It needs a threat-model review (A5) before implementation starts, as the spec requires.
  - The spec's Teleport-*style* requirements (short-lived certificates, GitHub team mapping, deny by default, approval for production elevation, audit) still apply in full. GitHub repository access never implies SSH role authorization.
  - A spec erratum for the "Recommended strategy" section should be logged by A0 once this ADR is accepted.
- Decision D3 is answered for architecture purposes. The CE eligibility fact itself stays open on EZF-24 and only matters if the optional Teleport integration is built.

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
