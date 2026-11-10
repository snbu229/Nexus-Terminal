---
name: nexus-c1-review
description: Use when performing an independent C1 security and quality review of a Nexus PR or deliverable. Pin the exact head SHA, re-run checks from a fresh clone, verify claims against raw evidence, apply the Nexus security checklist, and never review your own work.
---

# Nexus C1 review

## Use when

You are the C1 reviewer on a Paperclip issue (by default QA Security, A5). C1 is an independent technical gate; it is not a production authorization (`docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/SECURITY_GATES_V3.md` §1).

## Procedure

1. **Independence.** If you authored or co-authored the change, stop and hand it back. You never approve your own work.
2. **Pin the head SHA.** Record the PR number, base branch and exact head SHA. Your verdict applies only to that SHA. A new commit needs re-review.
3. **Fresh clone re-run.** Clone into a clean directory, check out the head SHA, install from the lockfile, and run the checks yourself (`pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, plus the doc, secret and gate checks in `nexus-devops-ci`). Attach your raw output. Don't rely on the author's output.
4. **Verify every claim.** Each test, number or citation the author gives must match the raw artifacts. Anything without evidence is **unverified**.
5. **Read the whole diff**, including tests, lockfile, CI and config changes.

## Security checklist

- No secrets, keys or tokens in the diff or the history range.
- Dev safety rules hold (M-D1 plan, EZF-43 `plan` §5): `NEXUS_DEV_MODE=1` required; loopback bind; WebSocket `Origin` checked; scrubbed sandbox env; pinned SSH host key; no approve or deny endpoint and no `approved:true`; BR-16 latch; OSC 133 treated as unauthenticated; no telemetry or AI calls.
- No new network egress, paid resource, host permission or production target.
- Input validation at the boundary with `packages/contracts` schemas.
- Required negative tests exist **and fail without the fix** where practical.
- Dependencies are pinned and in the licence ledger, with no AGPL code reuse (see `nexus-oss-research`).
- Merge-gate files (`.github/`, `scripts/ci/`, lint or scanner configs) changed → `human-approval-required` class.

## Quality checklist

TypeScript strict passes with no new `any` or suppressions without reason; tests are deterministic; docs and ADRs are updated; the OS/arch compatibility declaration is present.

## Verdict

Post on the issue: head SHA, commands run with output, findings as **blocking** or **non-blocking** with file:line, and the verdict. Nobody waives a failing security or negative test alone (see `nexus-test-evidence`).

Never treat this instruction document as permission to access production hosts or install executable third-party code.
