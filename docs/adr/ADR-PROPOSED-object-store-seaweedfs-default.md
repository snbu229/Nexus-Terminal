# ADR (proposed): generic S3 API; SeaweedFS as the bundled default (replacing MinIO)

Status: **Proposed.** Needs C1 (A5) and C2 (A0). Lab test P-5 confirms the default.
Origin: EZF-13 (NX3-106). Evidence: `docs/research/component-comparison.md` §7.3; licence ledger finding F4.
Author: A1 Nexus CTO / Research Architect.

## Context

ARCHITECTURE names "MinIO optional" for artefacts, recordings and audit archives. MinIO is AGPL and was archived in 2026 (ledger `reject`).

Candidates, as observed on 2026-11-10:

| Candidate | Version | Licence | Notes |
|---|---|---|---|
| SeaweedFS | 4.53 | Apache-2.0 | `weed mini` single node; Object Lock with retention and legal hold [doc] |
| Versity S3 Gateway | v1.11.0 | Apache-2.0 | POSIX backend; Object Lock unverified |
| RustFS | 1.0.4 | Apache-2.0 | Object Lock [doc]; only recently reached 1.0 |
| Garage | v2.5.0 | AGPL-3.0 | |
| Ceph RGW | n/a | LGPL mix | |

## Decision

1. Nexus code uses **only the generic S3 API**, with no vendor admin APIs. Operators may point Nexus at any S3 endpoint, such as AWS S3 or a separately run Garage or Ceph.
2. **Bundled default for the Compose pilot: SeaweedFS** (`weed mini`). Audit archives use Object Lock in compliance mode (WORM).
3. **Fallback:** Versity S3 Gateway, if P-5 shows SeaweedFS is too heavy for the pilot.
4. **Defer** RustFS. Re-evaluate after six more months of releases.
5. **Reject** MinIO. Garage and Ceph are **external-service-only**: never bundled, linked or redistributed.

## Consequences

- An S3 compatibility test suite (Object Lock, versioning, presigned URLs) runs against the bundled default in CI once CI exists.
