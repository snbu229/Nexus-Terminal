# ADR (proposed): Valkey for ephemeral state only

Status: **Proposed.** Needs C1 (A5) and C2 (A0).
Origin: EZF-13 (NX3-106). Evidence: `docs/research/component-comparison.md` §7.2; licence ledger rows `valkey` (adopt) and `redis` (reject).
Author: A1 Nexus CTO / Research Architect.

## Context

ARCHITECTURE says "Redis for ephemeral pubsub and cache". Redis 8 is tri-licensed RSALv2, SSPL or AGPL-3.0, which the ledger rejects. The kickoff rule is "Valkey, not Redis". Valkey 9.1.3 (BSD-3-Clause, HEAD `7ec927fd1fa9`) is the drop-in candidate.

## Decision

1. **Adopt Valkey 9.1.x** for pub/sub fan-out to API replicas, rate limiting, short-lived attach-token nonces and caches.
2. **Nothing durable lives in Valkey.** Approvals, sessions, audit and outbox rows live in Postgres. Losing Valkey must lose no committed state (lab test P-2).
3. Persistence (RDB/AOF) is off by default. Valkey binds only to the internal network and requires auth.
4. The Valkey client library gets its own licence-ledger row before adoption.

## Consequences

- ARCHITECTURE's "Redis" wording should be corrected to "Valkey" in the next spec revision.
