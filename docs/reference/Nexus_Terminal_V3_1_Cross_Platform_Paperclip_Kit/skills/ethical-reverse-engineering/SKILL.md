---
name: ethical-reverse-engineering
version: 0.1.0
summary: Safely analyze public functionality and legally reusable open source code to produce independent software specifications.
---
# Ethical feature-comparison and clean-room reverse-engineering skill

## Activate when
A Paperclip issue involves comparing Warp, Teleport, Termix, Herdr, Happier, HAPI, Wave Terminal, or other comparable systems, or user requests 'reverse engineer' their functionality.

## Required behavior
1. Read `CLEAN_ROOM_RESEARCH_PLAYBOOK.md` and the product's official documentation before observing anything.
2. Confirm authorization and license for every proposed black-box test or source study. Never use hidden/internal endpoints, exploit authentication, bypass DRM, decompile proprietary files without authorized rights, or copy closed source/assets/UI trade dress.
3. Record each public function as input -> user-visible output -> constraints -> standards/protocol surface -> acceptance test. Cite authoritative docs or source commit/tag and state confidence.
4. For open-source implementations: record package/version, exact license and transitive licenses, maintenance, security advisories and changes proposed. Track notices and source-distribution requirements.
5. Use clean-room division: research authors supply independent behavior spec, implementation authors write original implementation from permitted materials; QA compares black-box behavior using controlled authorized instances.
6. Threat-model security-critical features with **defensive** tests and admin-approved fixtures only.
7. Deliver study report, feature matrix, legal/OSS evaluation, ADR, acceptance tests and outstanding unknowns. Never claim feature is supported without a verified source.

## Exit checks
Citations, explicit license decision, clean-room specification, reproducible tests, and sign-off by A1 + A5. If any prohibition prevents a comparison, document the limitation and stop that activity.
