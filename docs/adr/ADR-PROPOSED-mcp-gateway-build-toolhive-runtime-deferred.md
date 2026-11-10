# ADR (proposed): build a thin Nexus MCP gateway; ToolHive deferred as an optional isolation runtime

Status: **Proposed.** Needs C1 (A5) and C2 (A0). The flip condition is decided by NX2-072 prototype P-1.
Origin: EZF-13 (NX3-106). Evidence: `docs/research/component-comparison.md` §7.1.
Author: A1 Nexus CTO / Research Architect.

## Context

MASTER §7 requires per-agent scope tokens, tool allowlists, approval gates, idempotency, and that no agent can modify its own access policy.

ToolHive (stacklok/toolhive, Apache-2.0, v0.63.0, HEAD `b36d370ce446`) offers:

- per-server container isolation;
- default-deny Cedar policies, applied "when configured with an authentication source";
- OIDC/OAuth;
- OTel and Prometheus;
- a registry and a virtual-MCP gateway.

Its limits:

- It needs Docker, Podman or Kubernetes.
- RBAC-to-Cedar compilation is an Enterprise feature.
- It is pre-1.0.

## Decision

1. **Build** a thin Nexus MCP gateway as the policy enforcement point. It covers authn, scope tokens, tool allowlist, plan and approval binding, and audit through the outbox. All decisions go through the Nexus policy engine, so there is one PDP.
2. **Defer** ToolHive as an optional *isolation runtime* for untrusted third-party MCP servers. It applies only on Linux runners that already have a container runtime. It never runs on the control plane, so the control plane takes no `docker.sock` dependency.
3. **Flip condition (NX2-072, P-1).** If ToolHive can delegate authorization to an external PDP and integrating it takes measurably less code than our own sandbox, ToolHive becomes the default MCP server runtime behind the Nexus gateway.

## Consequences

- No second policy language (Cedar) in R1.
- Third-party MCP servers in R1 run only in the agent runner's existing sandbox (per-job OS account or container).
