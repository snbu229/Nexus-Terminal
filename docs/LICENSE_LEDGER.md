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
| typescript-eslint | 8.72.2  | MIT        | EZF-44   | TS lint rules (dev)                                      |
| prettier          | 3.9.10  | MIT        | EZF-44   | Formatting (dev)                                         |
| @types/node       | 24.19.2 | MIT        | EZF-44   | Node typings (dev)                                       |

Transitive dependencies are recorded in `pnpm-lock.yaml`; a full transitive licence scan is a follow-up for CI.
