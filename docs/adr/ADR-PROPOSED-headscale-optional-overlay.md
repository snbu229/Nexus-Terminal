# ADR (proposed): Headscale is an optional, operator-run overlay; Tailscale SSH stays disabled

Status: **Proposed.** Needs C1 (A5) and C2 (A0). NX2-007 (network ADR) may supersede this.
Origin: EZF-13 (NX3-106). Evidence: `docs/research/component-comparison.md` §7.5.
Author: A1 Nexus CTO / Research Architect.

## Context

Network placement B (Nexus in the cloud, hosts behind NAT) can use a WireGuard overlay or a Nexus outbound mTLS connector.

Headscale v0.29.7 (BSD-3-Clause, HEAD `48416ce0894e`):

- implements a single tailnet;
- supports OIDC registration, ACLs and grants, and **Tailscale SSH**;
- states that "OIDC groups cannot be used in ACLs";
- states that its maintainers "do not support nor encourage" running it behind reverse proxies or in containers.

Tailscale's GUI clients for macOS, Windows and iOS are not open source, per the Headscale README.

## Decision

1. **Integrate Headscale as an optional, operator-run overlay.** It is not bundled in the Nexus Compose stack. Nexus treats an overlay address as an ordinary `host_route`.
2. **Tailscale SSH must be disabled** in the Headscale policy. It would bypass Teleport/Nexus SSH authorization and audit. Lab test P-6 is a negative test for this.
3. Group-to-role mapping stays in the access provider (EZF-7), never in Headscale ACLs.
4. The Nexus outbound mTLS connector remains the first-party path for NAT'd hosts.
5. On macOS hosts, use only the open-source `tailscaled` build. Ledger row and test P-6 are required, and this choice is [inferred] until tested.

## Consequences

- Nexus does not manage the Headscale lifecycle in R1. Operator docs describe the expected ACL, including the SSH deny.
