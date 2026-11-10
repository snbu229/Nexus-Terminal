---
name: signed-connector-bootstrap
description: Use when planning a Nexus host connector install for macOS (launchd, signed and notarized .pkg) or Linux (systemd, verified .deb/.rpm). Produces a version-pinned install plan with permissions, enrollment TTL, rollout, rollback and tests; never installs without host-owner approval.
---

# Signed connector bootstrap

## Use when

A task designs, documents or tests connector installation, enrollment, upgrade or removal.

Read first: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/CONNECTOR_INSTALL_APPROVAL.md`, `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/deploy/HOST_CONNECTOR_INSTALLER_STRATEGY.md` and `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/CROSS_PLATFORM_PRODUCT_CONTRACT.md`.

## Procedure

1. The output is a **plan**, not an install. It names the package, version, digest, signer, files, service unit, user, permissions, network endpoints and the exact commands.
2. Cover both platforms: macOS uses launchd and a signed, notarized `.pkg`; Linux uses systemd and a verified `.deb` or `.rpm`. The connector runs as a non-root service; any privileged helper is narrow and listed.
3. Installing needs host-owner approval bound to an immutable plan hash (risk tier T2). Agents never run the install on a host they weren't approved for, and never on production.
4. Agents never handle signing or notarization keys.
5. Enrollment tokens are short-TTL and single-use.
6. Include an explicit rollback and a full uninstall, and test both.

## Required negative tests

Replayed enrollment token; expired token; package signature or digest mismatch; plan changed after approval; uninstall leaves no service, user or key behind.

## Review

C1 and C2 approve the exact head SHA; the author never approves their own work; a new commit needs re-review. Changes are in the `human-approval-required` merge class.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
