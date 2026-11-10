---
name: nexus-oss-research
description: Use when researching an open-source project, adding a dependency, or updating Nexus docs. Licence and provenance ledger with SPDX and pinned SHAs, clean-room rules, AGPL and Teleport restrictions, and the docs/reference read-only rule. Overrides the catalog doc-maintenance skill where they differ.
---

# Nexus OSS research and licence ledger

## Use when

You study an OSS project, add or upgrade a dependency, cite an external source, or maintain docs. Pairs with the catalog skill `doc-maintenance`; **where they differ, this skill wins.**

Read first: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/CLEAN_ROOM_RESEARCH_PLAYBOOK.md` and `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/OSS_RESEARCH.md`. The ledger is `docs/research/license-ledger.md` (_pending_: on branch `EZF-5-nx2-005-create-complete-license-and-dependency-compatibility-ledger`); monorepo dependency rows go in `docs/LICENSE_LEDGER.md`. If the ledger you need isn't on your base yet, put the rows in your PR and say where they belong.

## Ledger row (one per component)

Name; version; **pinned source** (commit SHA, or version plus artifact digest); **SPDX licence** with the file or manifest you read it from; transitive licences of note; how Nexus uses it (dependency, external integration, docs only, reference only); decision (adopt, external only, reference only, reject) with reason; date checked. "Unverified" is a valid value and blocks release, not research.

## Hard rules

- **No code reuse from AGPL projects** (HAPI, Grafana, MinIO) or from Teleport source (AGPL-3.0). Reading public docs for behaviour is fine.
- **Never bundle or redistribute Teleport binaries or images.**
- Use Valkey, not Redis.
- Clean-room: research writes behaviour specs; implementers write original code from permitted material only (see `ethical-reverse-engineering`).
- Cite pinned commits or tags, not `main` or `latest`. Distinguish **[doc]** (read in the source) from **[inferred]** and **[unverified]**.
- The outbound licence for Nexus is a proposed ADR (Apache-2.0, EZF-24), not legal clearance. Nothing is published externally until the board confirms it.

## Overrides of `doc-maintenance`

- `docs/reference/**` is a read-only reference record and is never "fixed for drift". Spec changes go through an ADR in `docs/adr/` (see `nexus-architecture-adr`).
- Re-run doc examples only in the local sandbox or on disposable infrastructure. Never re-run install, host or credentialed commands.
- Release notes never include undisclosed vulnerability details.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
