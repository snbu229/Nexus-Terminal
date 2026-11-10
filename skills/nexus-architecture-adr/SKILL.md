---
name: nexus-architecture-adr
description: Use when a Nexus decision changes architecture, protocols, providers, licences or a spec rule, or resolves a spec inconsistency (I-1..I-7). Write a proposed ADR in docs/adr/ with context, options, evidence, consequences and rollback, and route it to the right approvers.
---

# Nexus architecture decisions (ADR)

## Use when

- A choice is hard to reverse: language or runtime, protocol, access provider, persistence, packaging, plugin model.
- Work would change or contradict a rule in `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/`.
- A task depends on an open spec inconsistency I-1..I-7 (EZF-2 `plan` document; reconciliation in EZF-16). Flag it and write or link an ADR instead of guessing.

Read first: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/MASTER_BUILD_PLAN_V3.md`, `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/ARCHITECTURE.md` and `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/CROSS_PLATFORM_PRODUCT_CONTRACT.md`.

## File and status

- Path: `docs/adr/ADR-PROPOSED-<kebab-slug>.md`. Title: `# ADR (proposed): <decision>`.
- Header lines: `Status:` (Proposed / Accepted / Superseded, and who must approve), `Origin:` (issue IDs), `Depends on:` (PRs or ADRs), `Author:` (role).
- An ADR is **Proposed** until C1 and C2 approve it on its head SHA. ADRs touching auth, access, SSH keys, security policy, licences or deployment also need a recorded human board approval.
- Never edit `docs/reference/**` to match an ADR. The ADR records the deviation; A0 keeps the spec erratum.

## Sections

1. **Context:** the problem, constraints, and the spec text it touches (cite path and section).
2. **Decision:** numbered, testable statements.
3. **Consequences:** what changes, spec deviations listed explicitly, security and licence impact, OS/arch impact (macOS and Linux), cost.
4. **Alternatives considered:** each with why it lost. Include "build" and "integrate" options.
5. **Evidence:** cited docs or pinned source commits, and prototype or benchmark results with the command, commit and raw output. Mark anything unrun as **unverified**.
6. **Rollout, rollback and audit impact** for anything touching infrastructure.
7. **Open items:** each linked to a Paperclip issue.

## Rules

- Prototypes are short, local and disposable; benchmarks must be repeatable, with a stated fallback.
- Licence facts come from the ledger (see `nexus-oss-research`); never choose an option whose licence is unverified without saying so.
- C1 and C2 approve the exact head SHA; the author never approves their own work; a new commit needs re-review.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
