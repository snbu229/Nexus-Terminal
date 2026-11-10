# ADR (proposed): Postgres transactional outbox for R1; Temporal deferred behind explicit triggers

Status: **Proposed.** Needs C1 (A5) and C2 (A0). Resolves EZF-2 plan inconsistency **I-2** once accepted.
Origin: EZF-13 (NX3-106). Evidence: `docs/research/component-comparison.md` §7.4.
Author: A1 Nexus CTO / Research Architect.

## Context

The spec documents disagree on the workflow engine:

- ARCHITECTURE names Temporal.
- MASTER §7 accepts a DB outbox for the MVP.
- PRODUCT puts durable workflows in R2.
- Backlog NX2-054 says "via Temporal".

Temporal v1.32.2 (MIT, HEAD `862b2db4c869`) adds a server deployment plus persistence and visibility stores. Its docs recommend OpenSearch for "more than a few" workflow executions. The company runs on USD 300/month, and NX2-016 already builds the outbox.

## Decision

1. **Build on a Postgres transactional outbox for R1.** It includes:
   - idempotency keys;
   - `FOR UPDATE SKIP LOCKED` workers;
   - bounded retries and dead letters;
   - a `due_at` timer scanner for approval expiry and escalation.
2. Write side-effecting steps as **idempotent activities behind an interface**. A later Temporal migration then rewrites only orchestration.
3. **Revisit Temporal** when any of these triggers fires:
   - more than 3 workflow types need multi-step compensation;
   - the timer scanner misses its SLO in the soak test;
   - a human-in-the-loop flow needs more than 2 chained waits.
4. Retitle NX2-054 so it no longer says "via Temporal".

## Consequences

- No new stateful service in R1.
- Lab test P-2 proves no lost or duplicated side effects under worker and Valkey failure.
