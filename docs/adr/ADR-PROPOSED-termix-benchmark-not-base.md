# ADR (proposed): Termix is a benchmark, not the Nexus base platform

Status: **Proposed.** Needs C1 (A5) and C2 (A0).
Origin: EZF-13 (NX3-106, absorbs NX2-001). Evidence: `docs/research/component-comparison.md` §2, §3.
Author: A1 Nexus CTO / Research Architect.

## Context

Termix (Termix-SSH/Termix, Apache-2.0, v26.11.1, HEAD `4061229760e8` on 2026-11-10) is a self-hosted server-management platform. It covers hosts, credentials, sharing, SSH, SFTP, tunnels and remote desktop. Most of that is a plugin; there are 75 plugins, and the 7 checked are all Apache-2.0. It is the closest open-source analogue to the Nexus host and terminal plane, and its licence would allow a fork.

## Decision

Do **not** fork, embed or build on Termix. Use it as the UX and feature benchmark (12 comparisons in the research doc §3).

Adopt these ideas: per-repo plugins managed from one admin tab, a four-level sharing vocabulary (connect, view, edit, manage), snippets as editor input, and per-host plus cross-host operations views.

Reject these models: server-stored SSH private keys, the SSH terminal as a removable plugin, offline copies of account secrets on desktops, publishing private services through tunnels, and telemetry on by default.

## Consequences

- Nexus builds its own host, credential-reference and terminal core on the Teleport-style access model (EZF-7) and remote tmux.
- Apache-2.0 code reuse from Termix stays *allowed* but is not planned. Any snippet reused later needs a ledger row, NOTICE and C1 review. Termix branding and assets are never copied.
- Lab test P-6 records Termix's session-persistence behaviour as a comparison point.

## Alternatives considered

- Fork Termix and harden it. Rejected: the stored-key credential model and plugin-optional terminal are core to its design, and replacing them amounts to a rewrite on a Node SSH stack, while I-1 proposes a Go gateway.
- Integrate Termix as an optional UI. Rejected for R1: two host registries would diverge.
