# ADR 0001: Marketplace package model, permissions, registries and signing

- Status: **Proposed** (EZF-69 / MK-1). Needs C1 (QA & Security) and C2 (CTO) review.
- Scope: `packages/marketplace`, `marketplace/dev-registry/`.

## Context

Nexus will offer agent templates, skills, MCP-server descriptors, harness adapters and terminal
extensions. MK-1 delivers a local, development-only marketplace. The invariant for MK-1 is that
**no package content is ever executed**. Installing records a package and copies verified
declarative files into a sandbox directory.

## Decision

### Package model

A package is a directory with `manifest.json` plus the files it lists. Manifest v0 (strict zod
schema; unknown fields are rejected): `id`, `kind`
(`agent-template | skill | mcp-server | harness-adapter | terminal-extension`), `version` (semver),
`publisher`, `license` (SPDX expression), `description`, `categories[]`,
`compatibility {nexus range, os[], arch[], harness[]}`, `files[] {path, sha256}`, `digest`,
`permissions[]`, `source {registry, ref}`.

- **Digest**: sha256 of canonical JSON (sorted keys; `files`, `permissions`, `categories` and
  compatibility lists sorted) of the manifest without `digest`. File hashes are inside it, so one
  digest pins the whole package. The registry index repeats the digest and a mismatch is rejected.
- **Declarative only**: file extensions are allow-listed (`.md .txt .json .yaml .yml .toml`).
  Executable bits, `#!` and ELF content, and manifest fields `scripts`, `postinstall`, `hooks`,
  `bin`, `main`, `command`, `exec` and similar are rejected. There are no lifecycle hooks.
- **Path safety**: relative POSIX paths only. Absolute paths, `..`, `.`, empty segments,
  backslashes, drive letters and symlinks (checked with `lstat` over the whole tree, including
  undeclared files) are rejected. Files on disk that the manifest does not list are rejected.
  Install copies the bytes that were hashed, not a second read, to avoid check/use races.

### Permission enum (closed; risk level in brackets)

`ui.theme` (low), `ui.keymap` (low), `fs.read.workspace` (low), `fs.write.workspace` (medium),
`agent.session.start` (medium), `terminal.output.read` (medium), `terminal.input` (high),
`net.egress` (high), `process.spawn` (high), `secrets.read` (critical), `host.ssh` (critical).

A manifest may not name a permission outside the enum. Kinds imply minimum permissions
(`agent-template` → `agent.session.start`, `mcp-server` → `net.egress`,
`harness-adapter` → `process.spawn`); a manifest that omits them is rejected as under-declaring.
The package-level risk indicator is the maximum permission risk. `host.ssh` and `secrets.read`
are default-deny in the dev policy and must never be silently grantable to an agent-authored
package. This is consistent with Teleport/RBAC rules: marketplace permissions grant no SSH access.

### Organisation policy

`allowedRegistries`, `allowedPublishers`, and a per-permission `allow | require_approval | deny`.
Unmapped permissions are **denied**. The worst result wins and every reason is returned.

### Install state machine

`available → install_requested → (pending_approval) → installed → remove_requested → removed`.
`available` is implicit. A removed package may be re-requested.

- Checks run before any state is recorded: integrity, compatibility, policy. Files are then
  copied into a fresh `mkdtemp` staging dir inside `realpath(sandboxRoot)` and `rename`d into
  place; only after that are `install_requested` and `installed` recorded. A denied, invalid or
  failed request leaves no record and no files; cleanup removes only the staging dir. An existing
  target or a symlinked package dir is refused (`sandbox_conflict`, `unsafe_path`), and all
  filesystem failures surface as `MarketplaceError`.
- `pending_approval` has **no exit in dev**. There is no approve API. `attemptApproval` only
  refuses (`self_approval` if the approver is the requester, otherwise `approval_unavailable`).
  Any `approved` key anywhere in input, or in a persisted state file, is rejected. A real
  approval path is a human-only, audited flow and is out of scope here.
- Removal is only valid from `installed`.

### Registries

- **Now**: `local-dev`, a directory (`marketplace/dev-registry/`) with `index.json` and package
  directories. Dev only; the API and UI are out of scope.
- **Later**: a private organisation registry, then a public one. A registry id is a policy input;
  a manifest whose `source.registry` differs from the registry serving it is rejected.
  Network fetching will require TLS, pinned refs and the same digest checks.

### Signing (later)

Sigstore (cosign keyless, with a transparency log) over the manifest digest, with policy on the
signer identity per publisher. Out of scope for MK-1: dev packages are integrity-checked by
digest only, which proves consistency, not authorship.

### Threat model summary

| Threat                                           | Mitigation in MK-1                                              |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Tampered file or manifest                        | per-file sha256, manifest digest, index digest                  |
| Path traversal, absolute path, symlink escape    | lexical checks plus `lstat` tree walk; sandbox install via realpath root, `lstat` refusal of symlinked package dirs, staging dir plus `rename`     |
| Tampered install state file (forged `sandboxPath`) | remove rebuilds the path from the real sandbox root, refuses mismatch or symlink (`unsafe_path`); record ids and versions validated on load |
| Code execution at install                        | declarative allow-list, no hooks, no exec bits; nothing is run  |
| Hidden extra payload                             | undeclared files rejected                                       |
| Permission creep or invented permission          | closed enum, kind-implied permissions, default-deny policy      |
| Self-approval or forged approval                 | no approve API, `approved` key rejected, requester check        |
| Untrusted registry or publisher                  | policy allow-lists                                              |
| Malicious content in text skills (prompt inject) | **not mitigated** here; agents must treat skills as untrusted input |
| Publisher impersonation                          | **not mitigated** until signing                                 |

## OS/arch compatibility

Targets macOS and Linux, arm64 and x64. Packages are declarative files only, so there is no
platform-specific code; manifests declare `os`/`arch` and installs are refused when incompatible.
macOS filesystems are case-insensitive and normalise Unicode, so the manifest rejects file paths
that collide after `NFC` + lowercase (otherwise the second write would conflict on macOS). Tests
have so far run only on linux-x64; macOS and arm64 are untested. A `terminal-extension` keymap
that sends text is effectively `terminal.input` and must declare that permission.

## Consequences

Positive: a small, fully testable trust core that later registries and the API reuse.
Negative: no authorship guarantee, and approvals cannot complete in dev until the human approval
flow exists. Open: SPDX validation is syntactic only; semver support is a minimal subset
(no external dependency) and should be swapped for a vetted library if ranges get richer.

Residual risk: a TOCTOU window exists between the `lstat` checks and the `rename` in install; only a same-user process with write access to the sandbox root could exploit it. Accepted for the dev marketplace.
