---
name: nexus-devops-ci
description: Use when changing or running Nexus CI, the ci-required gate, local checks, or the dev docker compose. Pinned actions and tools, read-only tokens, no secrets in CI, no paid resources, and no production.
---

# Nexus DevOps and CI

## Use when

A task touches `.github/workflows/`, `scripts/ci/`, `Makefile`, `infra/dev/`, the local setup doc (_planned_ as `docs/dev/LOCAL_SETUP.md` in the EZF-43 plan; it doesn't exist on any branch yet), or you need to run the repo checks before a PR.

Read first: `docs/process/git-workflow.md` §2–§3 and `.github/workflows/ci.yml` (_pending_: on branch `EZF-28-nx4-164-repo-ci-baseline-pr-policy-files-required-merge-gate-for-the-pr-only-workflow`), and the M-D1 plan (EZF-43 `plan` document, §3 and §5).

## CI rules

1. **`ci-required`** is the single required check. It aggregates `workflow-lint`, `docs`, `security` and `code`. Never rename it, and never add a second job or workflow with that name.
2. New code lanes add lint, build and tests behind `make ci`; they don't add new required checks.
3. Actions are pinned to full commit SHAs; tool binaries are pinned by SHA-256. Never use `pull_request_target`; set `permissions: contents: read`; check out without persisted credentials; use no repository secrets.
4. Any change under `.github/`, `scripts/ci/`, Makefiles, `.markdownlint*`, `lychee.toml`, `osv-scanner.toml`, gitleaks config or `.gitattributes` is `human-approval-required` (see `nexus-pr-workflow`).
5. Check which branches CI triggers on. If your PR's base gets no CI run, say so on the issue and attach local check output instead. Don't claim a green CI you don't have.

## Local checks before a PR

Run the commands in `docs/process/git-workflow.md` §3 that apply, plus `pnpm lint`, `pnpm typecheck` and `pnpm test` once the monorepo exists. Use only the pinned tool versions that doc names. Attach the raw output (see `nexus-test-evidence`).

## Dev compose (`infra/dev`)

- Services: `api`, `web`, `sandbox-host`, with health checks on `/api/v0/healthz` and `/readyz`.
- The API needs `NEXUS_DEV_MODE=1`; publish ports on `127.0.0.1` only; no real credentials; dev volumes only.
- Images and base images are pinned by digest and listed in the licence ledger. Use Valkey, not Redis, if a cache is ever needed.

## Never

- No paid cloud resources, accounts or runners without board approval.
- No production hosts, credentials, signing keys or deploy steps. Deployment and release are human steps.
- No package installs on shared infrastructure without approval through Paperclip.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
