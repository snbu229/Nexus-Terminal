---
name: ethical-reverse-engineering
description: Use when a Nexus task compares Warp, Teleport, Termix, Herdr, Happier, HAPI, Wave or similar products, or asks to "reverse engineer" a feature. Produces an independent clean-room behaviour spec from public docs and legally reusable source.
---

# Ethical feature comparison and clean-room reverse engineering

## Use when

A Paperclip issue compares Nexus with another product, or a user asks to reverse engineer a feature.

## Required behaviour

1. Read `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/CLEAN_ROOM_RESEARCH_PLAYBOOK.md` and the product's official documentation before observing anything.
2. Confirm authorization and licence for every proposed black-box test or source study. Never use hidden or internal endpoints, exploit authentication, bypass DRM, decompile proprietary files without authorized rights, or copy closed source, assets or UI trade dress.
3. **No code reuse** from AGPL projects (HAPI, Grafana, MinIO) or from Teleport source (AGPL-3.0). You may read their public docs for behaviour; you never copy code, structure or tests from them.
4. Record each public function as input → user-visible output → constraints → standards or protocol surface → acceptance test. Cite the authoritative doc, or the source commit or tag, and state confidence.
5. For open-source implementations, record package, version, exact licence and transitive licences, maintenance, security advisories and proposed changes. Track notices and source-distribution duties. Record every dependency in the licence ledger (see `nexus-oss-research`).
6. Keep the clean-room split: research authors write an independent behaviour spec; implementation authors write original code from permitted material only; QA compares black-box behaviour on controlled, authorized instances.
7. Threat-model security-critical features with **defensive** tests and admin-approved fixtures only.
8. Deliver a study report, feature matrix, licence evaluation, ADR (see `nexus-architecture-adr`), acceptance tests and open unknowns. Never claim a feature is supported without a verified source.

## Exit checks

Citations, an explicit licence decision, a clean-room spec, reproducible tests, and sign-off by CTO (A1) and QA Security (A5). C1 and C2 approve the exact head SHA; the author never approves their own work; a new commit needs re-review. If a prohibition prevents a comparison, document the limitation and stop that activity.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
