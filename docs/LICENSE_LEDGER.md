# Dependency licence ledger

One line per dependency. Permissive licences only; versions pinned exactly.

| Package           | Version | Licence    | Added by | Purpose                                                  |
| ----------------- | ------- | ---------- | -------- | -------------------------------------------------------- |
| zod               | 4.6.7   | MIT        | EZF-44   | Contract schemas and inferred types (`@nexus/contracts`) |
| yaml              | 2.9.1   | ISC        | EZF-44   | Parse `openapi.yaml` in contract tests (dev)             |
| typescript        | 5.9.3   | Apache-2.0 | EZF-44   | Type checking (dev)                                      |
| vitest            | 4.1.12  | MIT        | EZF-44   | Test runner (dev)                                        |
| eslint            | 10.14.0 | MIT        | EZF-44   | Linting (dev)                                            |
| @eslint/js        | 10.0.1  | MIT        | EZF-44   | ESLint recommended rules (dev)                           |
| typescript-eslint | 8.72.1  | MIT        | EZF-44   | TS lint rules (dev)                                      |
| prettier          | 3.9.10  | MIT        | EZF-44   | Formatting (dev)                                         |
| @types/node       | 24.19.2 | MIT        | EZF-44   | Node typings (dev)                                       |
| fastify           | 5.12.8  | MIT        | EZF-45   | Dev API HTTP server (`@nexus/api`)                       |
| @fastify/cors     | 11.4.1  | MIT        | EZF-45   | CORS limited to the configured web origin (`@nexus/api`) |
| tsx               | 4.23.15 | MIT        | EZF-45   | Run/watch TypeScript in dev and the entrypoint test (dev) |

Transitive dependencies are recorded in `pnpm-lock.yaml`. `pnpm licenses list` scan at EZF-44 (MIT 104, Apache-2.0 14, ISC 8, BSD-2-Clause 6, BSD-3-Clause 2, MPL-2.0 2, BlueOak-1.0.0 1; no AGPL/GPL) found these non-default licences:

| Package                                       | Licence     | Note                                                                |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| lightningcss, lightningcss-linux-x64-gnu      | MPL-2.0     | transitive (vitest → vite), dev-only, not redistributed; file-level copyleft |
| minimatch                                     | BlueOak-1.0.0 | transitive, dev-only, not redistributed                           |
