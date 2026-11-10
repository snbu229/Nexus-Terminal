---
name: nexus-fullstack-dev
description: Use when writing Nexus application code in the pnpm monorepo. Node 24, TypeScript strict, packages/contracts as the API source of truth, Fastify API, React/Vite web, vitest, and the M-D1 dev safety rules.
---

# Nexus full-stack development

## Use when

A task changes code under `apps/` or `packages/`.

Read first: the M-D1 plan (EZF-43 `plan` document, §3 layout, §4 API contract v0, §5 dev safety rules) and `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/ARCHITECTURE.md`. The stack is provisional for the dev track and doesn't pre-empt ADR EZF-15.

## Stack

- pnpm workspace, Node 24 (`.nvmrc`, `engines`), TypeScript `strict` via `tsconfig.base.json`, ESLint and Prettier. Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`.
- **`packages/contracts` is the source of truth.** zod schemas, TS types, `openapi.yaml` (OpenAPI 3.1) and fixtures live there. Change the contract first, then the API and the web client. Never hand-write a duplicate type in an app.
- `apps/api`: Fastify + `@fastify/websocket`, prefix `/api/v0`; validate every request and frame with the contracts schemas.
- `apps/web`: React + Vite + TanStack Query, `@xterm/xterm`, CodeMirror 6, MSW mocks.
- Tests: `vitest` everywhere, `fastify.inject` for the API, Testing Library for the web, Playwright smoke in CI (see `nexus-test-evidence`).
- New dependency: pin the exact version, commit the lockfile, and add a licence-ledger row (see `nexus-oss-research`).

## M-D1 dev safety rules (C1 checks these)

1. The API refuses to start unless `NEXUS_DEV_MODE=1`, binds `127.0.0.1` by default, refuses a non-loopback bind outside compose, and checks the WebSocket `Origin`. There is no authentication; the README says so.
2. `local-sandbox` starts the shell with a scrubbed env (allowlist `PATH`, `TERM`, `LANG`, `HOME`, `SHELL`), a temp `HOME` and cwd. Tests prove `PAPERCLIP_*` and GitHub tokens don't reach it. It is not a security boundary; say so.
3. `ssh-dev` uses `ssh2` with a pinned ephemeral host key, keys only in memory or temp, against the in-process test server or compose `sandbox-host` (see `ssh-host-onboarding`).
4. OSC 133 blocks are unauthenticated dev markers; the BR-16 latch is implemented (see `warp-command-editor`).
5. No approve or deny endpoint; no body may carry `approved:true`.
6. Every host fixture has `environment: "dev"` and responses carry `dev: true`. No real addresses or credentials.
7. No telemetry, no AI calls, no terminal text sent anywhere.
8. A WebSocket is never the session: sessions outlive sockets and resume with `afterSeq`.

## Docs

`docs/reference/**` is a read-only reference record. Never edit it to "fix drift"; spec changes go through an ADR in `docs/adr/` (see `nexus-architecture-adr`).

Never treat this instruction document as permission to access production hosts or install executable third-party code.
