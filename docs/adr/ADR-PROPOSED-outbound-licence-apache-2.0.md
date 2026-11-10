# ADR (proposed): Apache-2.0 as the outbound licence for original Nexus Terminal source

Status: **Proposed. Provisional CEO business decision (2026-11-10, reconfirmed by the CEO the same day). Not legal clearance.** Qualified legal counsel and the company's authorized signatory or board must confirm it before any redistribution or external release.
Origin: EZF-24 (NX2-005a, human legal review, question Q1); licence ledger NX2-005 / EZF-5, `docs/research/license-ledger.md` §7 and findings F1, F9.
Depends on: PR #4 (EZF-5 licence ledger). The ledger paths, `check_ledger.py` and finding IDs cited here exist only on that branch until it merges, so PR #4 must merge before this ADR.
Author: A1 Nexus CTO / Research Architect. Review: C1 A5 QA & Security; C2 human board (legal topic).

## Context

The NX2-005 licence ledger left the Nexus outbound licence open. Every `adopt` row in the ledger is compatible with Apache-2.0 or MIT outbound, provided Nexus elects the Apache-2.0 branch of ntfy (`Apache-2.0 OR GPL-2.0-only`, finding F9). An AGPL outbound licence would have changed the HAPI and Warp outcomes.

On 2026-11-10 the CEO (Sandeep Reddy) answered the EZF-24 counsel questions card. The answer approves Apache-2.0 as the *proposed* outbound licence, subject to final legal and third-party licence review. The reviewer stated that these are provisional business decisions within delegated authority, not legal advice or legal clearance.

## Decision

Original Nexus Terminal source code is **proposed** to be licensed under **Apache License 2.0** (SPDX `Apache-2.0`), subject to the conditions below, once qualified counsel and the authorized signatory or board confirm this ADR. **Until then, no licence is granted** for the repository contents.

Conditions set by the decision-maker:

1. Preserve all required notices, copyright statements, attribution and third-party licence obligations (every obligation in the ledger `notice_obligations` column, including CC-BY-4.0, OFL-1.1 and the per-component `SSH-OpenSSH` notices, not only the §3 shorthands `MIT`, `APACHE`, `BSD3`, `ISC`).
2. Resolve finding F9 (ntfy) before adopting or distributing ntfy. The ledger records an Apache-2.0 election for ntfy. It must be confirmed in legal review and written into `THIRD_PARTY_NOTICES` before ntfy ships in any Nexus artefact.
3. Do not copy proprietary Warp or Teleport implementations. The clean-room rule (`CLEAN_ROOM_RESEARCH_PLAYBOOK.md`) and ledger outcomes `warp = reject`, `teleport = external-service-only` stay in force.
4. Treat AGPL components (HAPI and others) as separate services or research references only, until their licensing implications have been reviewed. The ledger keeps HAPI at `reject`, which is stricter than this condition. Moving it to `external-service-only` would need its own reviewed ledger change.
5. Do not relicense third-party source code under Apache-2.0 without the necessary rights. Third-party files keep their own licence headers and notices.
6. Development may continue with original, Apache-2.0-compatible code. Final redistribution approval requires the licence review to be complete.

## Consequences

- No ledger row changes its recommendation. The ledger's `adopt` set was already checked against an Apache-2.0 or MIT outbound licence. `check_ledger.py` rule 3 (fixed decisions) is unchanged.
- New dependencies must have inbound licences compatible with Apache-2.0 outbound. Permissive: `adopt` possible. Weak copyleft (LGPL, MPL): case-by-case review. Strong or network copyleft and proprietary terms: `external-service-only` or `reject`.
- **This is not yet enforced by tooling.** `check_ledger.py` blocks AGPL, SSPL, RSAL, BUSL and `LicenseRef-` adoption, but a GPL-only, LGPL or MPL `adopt` row passes (C1 probe on EZF-35). Follow-up on the ledger (EZF-5 or a new issue, not this PR): an outbound-aware rule that fails a GPL-family-only `adopt` row unless a permissive branch is elected, requires a recorded review for LGPL/MPL rows, and adds a selftest mutation. Per-package SBOM and licence scanning is also still a follow-up (ledger §9).
- **Not done by this ADR, on purpose:** no `LICENSE`, `NOTICE` or `THIRD_PARTY_NOTICES` file is added, and no SPDX headers are added to sources. The repository is public, and a committed `LICENSE` file is a licence grant. It is added in a separate change after counsel confirms this ADR.
- Contributions: an inbound contribution policy (DCO or CLA) is not decided here. It is a question for counsel together with this ADR. Until it is settled, external contributions are not accepted.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| MIT | Also compatible with every `adopt` row. Apache-2.0 adds an explicit patent grant and a `NOTICE` mechanism, and matches many adopted components (Termix, Herdr, Keycloak, step-ca, Codex CLI, ACP). |
| AGPL-3.0 | Would allow HAPI/Warp AGPL code reuse, but makes every Nexus deployment a network-copyleft obligation for operators. Not chosen by the decision-maker. |
| Dual Apache-2.0 OR MIT | Possible later. Adds no compatibility for the current ledger. |

## Open items (tracked on EZF-24)

- Qualified counsel and the authorized signatory or board confirm or amend this ADR.
- Counsel confirms the ntfy Apache-2.0 election (F9).
- After confirmation: add `LICENSE`, `NOTICE` and `THIRD_PARTY_NOTICES` and an inbound contribution policy in a separate reviewed PR.
