---
name: nexus-test-evidence
description: Use whenever a Nexus task needs tests or claims they pass. Unit, integration and e2e layers, required negative tests, what counts as evidence, and never claiming a test that wasn't executed. Overrides the catalog qa-acceptance skill on waivers and evidence.
---

# Nexus test evidence

## Use when

You write tests, report results, mark a task done, or hand work to review. Pairs with the catalog skill `qa-acceptance`; **where they differ, this skill wins.**

Read first: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/TEST_STRATEGY.md`.

## Layers (M-D1 stack)

- **Unit:** `vitest` in each package (`packages/contracts`, `packages/command-editor`, `packages/agent-sessions`, `packages/terminal-sandbox`).
- **Integration:** `vitest` with `fastify.inject` for `apps/api`; in-process SSH test server for `ssh-dev`; Testing Library + MSW for `apps/web`.
- **E2E:** Playwright smoke against the dev compose (`infra/dev`).
- Write the test first, then the code.

## Negative tests are required

Each feature ships the denials its skill lists: e.g. unknown host key rejected, a request with `approved:true` rejected, a raw byte sets the BR-16 latch, `PAPERCLIP_*` and GitHub tokens absent from the sandbox shell env, forged OSC 133 ignored, a revoked user denied on reattach. A feature with only happy-path tests is not done.

## Outage simulations

Features that span a connector, Paperclip, the browser or a tmux session also need the outage and fault scenarios from `qa-chaos-and-release`: connector crash and restart, host reboot, Paperclip outage, connector outage, browser disconnect while tmux keeps running, duplicate delivery and a second writer. Run them only where that skill allows; otherwise report each one as **not run**, with the reason.

## What counts as evidence

- Raw artifacts attached to the Paperclip issue: the exact command run, the commit SHA it ran on, the full or tail test output with pass/fail counts, the CI run link, and artifact digests where there are artifacts.
- **An agent summary is not evidence.** "Tests pass" without output is not evidence.
- **Never claim a test that wasn't executed.** A test that couldn't run (no host, no macOS, no network) is reported as **not run**, with the reason. Skipped and pending tests are reported as such, never as passed.
- A test that passes only after you changed the assertion needs that change called out.

## Overrides of `qa-acceptance`

- The author or assignee can never waive a failing security or negative criterion. A waiver needs C1 and C2 (human board for sensitive work) and a tracked follow-up issue.
- "Telemetry" criteria are **N/A** in M-D1: there is no telemetry.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
