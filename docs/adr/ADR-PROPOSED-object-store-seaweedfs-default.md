# ADR (proposed): generic S3 API; SeaweedFS as the bundled default (replacing MinIO)

Status: **Proposed.** Needs C1 (A5) and C2 (A0). It stays Proposed until the P-5 lab results are attached.
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
2. **Bundled default for the Compose pilot: SeaweedFS** (`weed mini`). Audit archives use Object Lock in compliance mode (WORM). The bundled default ships only with these hardening conditions (research §7.3, sourced from the SeaweedFS README @ `3f5b07475dc3`):
   - **S3 credentials are always required.** The README notes that dropping the AWS keys runs the S3 endpoint "without authentication". Anonymous access is off.
   - **The Nexus service account is least-privilege.** It can write objects and read audit objects. It has no `BypassGovernanceRetention`, no bucket-policy or Object Lock configuration rights, and no admin access. The quick-start `admin` identity is not used at runtime.
   - **Admin authentication is required**, through `WEED_ADMIN_PASSWORD` or, preferably, `https.admin` mTLS. **`-admin.allowInsecureBind` is never used.** Multi-node workers use `grpc.admin` mTLS.
   - **Internal network only.** All `weed mini` listeners (S3, master, volume, filer, WebDAV, Iceberg REST, Admin) bind to the Compose internal network or loopback. No published host ports. Listeners Nexus does not use are disabled or firewalled.
   - **The audit bucket is created with Object Lock compliance mode** and a fixed default retention.
   - **The filer and volume HTTP APIs are unreachable** from every other container. Otherwise they could change stored data without going through S3 Object Lock [inferred].
3. **Fallback:** Versity S3 Gateway, if P-5 shows SeaweedFS is too heavy for the pilot.
4. **Defer** RustFS. Re-evaluate after six more months of releases.
5. **Reject** MinIO. Garage and Ceph are **external-service-only**: never bundled, linked or redistributed.

## Consequences

- An S3 compatibility test suite (Object Lock, versioning, presigned URLs) runs against the bundled default in CI once CI exists. It includes the P-5 negative cases:
  - an unauthenticated admin request is refused;
  - anonymous S3 is refused;
  - deletion inside retention is refused for both the service account and the admin;
  - filer and volume ports cannot be reached from other containers.
- Same posture as Valkey: internal bind and auth required.
- This ADR stays **Proposed** until P-5 results are attached, even after C1/C2 approve the research.

## Rollback

Switch the bundled default to Versity S3 Gateway, or to an operator-provided S3 endpoint. Nexus uses only the generic S3 API, so no code changes. Audit archives already written under compliance-mode Object Lock cannot be deleted before retention ends, by design. Migration copies them and does not move them.
