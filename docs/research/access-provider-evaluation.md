# Access provider evaluation: Teleport CE vs Teleport Enterprise vs Keycloak + step-ca

- Issue: EZF-7 (NX3-105), epic E00 / M0. Risk: sensitive.
- Author: A8 Nexus Identity. C1: A5. C2: human board.
- Date: 2026-11-10. Status: **DRAFT for review. Not an ADR and not a decision.**
- Clean-room: the sources are public vendor docs and project READMEs only. No Teleport binaries were downloaded, run or redistributed.

## 0. Read this first: what was and was not done

| Item | State |
|---|---|
| Edition, license, feature research from public docs | Done (§1, §2). Sources and fetch date are in §9. |
| Threat model | Done (§5). |
| Identity and revocation workflow design | Done (§6). |
| **Hands-on test of the identity/revocation workflow** | **NOT done.** The run host has no docker or podman, and the task forbids installing packages on shared hosts. §7 is an executable test plan, not results. |
| Acceptance criterion "tested identity/revocation workflow" | **Unmet.** It needs either a disposable container host approved by the board or a human-run lab, and it must use throwaway GitHub identities. |

Claims below are marked **[doc]** (stated in a fetched official page), **[inferred]** (my reading, not verified), or **[unverified]** (needs a lab test).

The doc fetcher summarizes pages through a small model, so quotes are secondhand. C1 should re-read the quoted sentences on the live pages before relying on them.

## 1. License fit

| Option | License | Fit for Nexus |
|---|---|---|
| Teleport CE 16 and later (binaries, images) | Commercial license: use is allowed only below 100 employees AND below US$10M annual revenue. No resale or embedding in products or services. **[doc]** (GitHub discussion #39158, announced 2024-03-08.) | Fits today only if the board confirms headcount and ARR are under both limits. The company must re-check this on growth. **The ban on embedding or reselling means Nexus must never ship or bundle Teleport.** Teleport can only be an *operator-installed external dependency*. This matches the existing rule not to redistribute Teleport binaries. |
| Teleport source | AGPLv3. **[doc]** | No code reuse. Building from source is a separate legal question. It is out of scope and needs legal sign-off. |
| Teleport CE 15 and earlier | Apache-2.0 **[doc]** | Old, unsupported lines. Not recommended. |
| Teleport Enterprise | Commercial contract. | Needs a sales quote. The public pricing page shows no numbers, only "active users and protected resources" **[doc]**. Cost is **unknown** and likely to blow the USD 300/month company cap. Needs board approval. |
| Keycloak | Apache-2.0. CNCF incubating project. **[doc]** | Fits. Record it in the license ledger. |
| step-ca (smallstep/certificates) | Apache-2.0 **[doc]** | Fits. Record it in the license ledger. |

## 2. Capability comparison

| Capability | Teleport CE | Teleport Enterprise | Keycloak + step-ca |
|---|---|---|---|
| GitHub login | Yes. **[doc]** Restriction: the GitHub org must have no external SSO configured, or Teleport refuses to create the connector. | Yes, plus Google Workspace, Entra ID, Okta, SailPoint, OIDC and SAML **[doc]** | Keycloak brokers GitHub as a social/OIDC identity provider **[doc]**. step-ca's OIDC provisioner can point at Keycloak **[doc]**. This is two moving parts with glue code. |
| GitHub team to role mapping | `teams_to_roles` entries in the form `org,team-slug,role[,role]`, using slugs **[doc]**. The app needs the `read:org` scope and must be granted every org that appears in the mapping **[doc]**. | Same | Keycloak does not map GitHub teams to groups out of the box **[inferred]**. It needs a custom mapper or a service that reads the GitHub API. That is Nexus-owned code. |
| Short-lived SSH user certs | Yes. Users get short-lived certs after login **[doc]**. Role `max_session_ttl` caps lifetime. | Yes | Yes. step-ca issues SSH user certs via OIDC. The JWK example shows a 5m to 24h range **[doc]**. SSH user certs cannot be renewed by design **[doc]**, so the user re-authenticates. That is good for security and worse for UX. |
| Host CA and agentless OpenSSH | Yes **[doc]** | Yes | Yes. step-ca signs SSH host certs. It has no agent, no session recording and no RBAC engine. |
| Per-host or per-label authorization | Role `node_labels` and `logins` **[doc: roles reference]** | Same | Not built in **[inferred]**. SSH cert principals are the only lever, so host labels need a Nexus-owned policy layer. |
| Per-session MFA | Yes **[doc]** | Yes | Depends on the IdP step. Keycloak can require MFA. Per-connection enforcement is not available. |
| Session recording and audit | Yes, in all editions **[doc]** | Yes | No. It would be Nexus-built. |
| Access requests (JIT) | CLI role requests only. A cluster admin approves with `tctl` on the Auth Service. No resource-level requests, no automated approval, no notification plugins, no UI **[doc]**. | Reviews, dual authorization, Slack/Teams/PagerDuty and similar plugins **[doc]** | None. Nexus builds the request state machine and issues short-lived certs only after approval. |
| Dual authorization for prod | **No** **[doc]** | Yes | Nexus-built. |
| Device trust, moderated sessions | No **[doc]** | Yes | No |
| Locks (revoke a user or session immediately) | The Teleport locking page says locks are **Enterprise-only** **[doc]**. **[unverified]**: this conflicts with my recollection that CE has `tctl lock`. This must be tested before the claim is used. | Yes. Locks terminate active SSH sessions and reject new requests. They propagate in "a moment", not instantly. Strict and best_effort modes exist. **[doc]** | Passive only. A revoked cert cannot be renewed, but it stays valid until it expires **[doc]**. Revocation is only as fast as the cert TTL. |
| Offboarding | Delete or suspend the user, remove the team mapping, wait for TTL expiry (CE) | Lock the user for an immediate kill | Remove the user in Keycloak, and the next issuance is denied. Existing certs live until expiry. |
| Cost | USD 0 licence, with the headcount and ARR conditions above | Unknown, sales quote needed | USD 0 licence. The engineering cost is the highest of the three. |
| Effort to adopt | Lowest | Low | Highest. Nexus would build the authorization, audit and recording layers, which contradicts the guidance "Do not build your own SSH CA or access broker until threat-model review proves need". |

## 3. Fit against the Nexus requirements

| Requirement | CE | Enterprise | Keycloak + step-ca |
|---|---|---|---|
| Human-only prod approval, two distinct approvers | **Gap.** CE has a single admin approver and no dual authorization. The Nexus approval ledger can gate Nexus-mediated actions only. It must not bypass Teleport's SSH decisions. | Yes, natively | Nexus-built |
| Immediate revocation on offboarding | **Gap, pending the lock test.** Fall back to short TTL. | Yes (locks) | TTL only |
| Network of trust without a direct-SSH bypass | Yes. Hosts trust the Teleport CA, and Nexus holds no host keys. | Same | Hosts trust the step-ca CA. Nexus must never hold a user key that works. |
| Tolerable below the company cap | Yes | Unknown | Yes |
| Does not require bundling the vendor binaries | Yes, as an external dependency | Yes | Yes |
| Supported platforms (macOS and Linux hosts) | Teleport documents macOS install and Linux packages. Confirm the OS/arch matrix against `compat/supported-platforms.yaml` **[unverified]**. | Same | step-ca is a Go binary for both. Confirm **[unverified]**. |

## 4. `AccessProvider` mapping

The contract is `listHostResources()`, `authorize()`, `issueEphemeralSession()`, `revokeUser()`, `auditEvents()`, `accessRequestCapabilities()`.

- `accessRequestCapabilities()` must be honest per edition. For CE it returns `{ requestUi: false, reviewers: false, dualAuth: false, cliRoleRequests: true }`. Nexus UI must not display controls that the backing provider cannot honour.
- `revokeUser()` returns a result with a `mode` field: `lock` (Enterprise, immediate), `ttl-expiry` (CE and step-ca, delayed), plus the latest possible time that access can end. Callers must never report "revoked" when the mode is `ttl-expiry`.
- `issueEphemeralSession()` returns a certificate only after a fresh `authorize()` for the same principal, host and role. The cert TTL is no longer than the approved window.
- `authorize()` must return deny-by-default. The provider is the source of truth for SSH. Nexus recomputes its own policy as a second check and never as an override.
- Keep Keycloak and step-ca as a second implementation behind the same interface. This keeps the exit path open if CE licensing stops fitting.

## 5. Threat model (STRIDE-lite)

| # | Threat | Asset | Mitigation | Residual risk / test |
|---|---|---|---|---|
| T1 | GitHub OAuth callback CSRF or code injection | Login | `state` and nonce bound to the browser session, exact redirect URI match | T-01 |
| T2 | Stolen GitHub token or `read:org` over-scope | GitHub org data | Minimum scope `read:org` only. Tokens are never logged and never sent to the browser. | T-02 |
| T3 | Removed team member keeps access | Hosts | Short cert TTL, membership re-check at every login, Enterprise lock where available. In CE the exposure window equals the cert TTL (the role `max_session_ttl`). | T-03, board must choose the TTL |
| T4 | GitHub repo access mistaken for SSH access | Hosts | Separate GitHub OAuth identity from the GitHub App. The App token never maps to a role. | T-04 |
| T5 | Self-approval or AI approval of escalation | Prod | Approver is a human and is not the requester. AI principals have no approve permission. Dual human approval on prod (Enterprise or Nexus ledger, but the ledger alone does not grant SSH). | T-05 |
| T6 | Replay of an approval, or approval used after a host fingerprint change | Prod | Approval bound to an immutable request digest, requester, host fingerprint, expiry and nonce. Revalidated at execution. | T-06 |
| T7 | CE `tctl` admin approval is a single point of failure | Prod | Admin is a named human with MFA. Requests need a reason. Role definitions are reviewed because a role that can edit roles allows permanent escalation **[doc]**. | Accepted gap in CE |
| T8 | Direct-SSH bypass with a leftover key or authorized_keys | Hosts | Hosts trust only the CA. Disable password auth. Audit authorized_keys during enrollment. | T-07 |
| T9 | Stale session after network outage over 30 min | Hosts | Reconnect requires a fresh cert and a fresh `authorize()`. Deprovisioned users fail. | T-08 |
| T10 | CA key compromise | Everything | Keep the CA key in the provider. Nexus never stores the CA or root keys. Rotation runbook. | Out of scope for the PoC |
| T11 | Enrollment of an OpenSSH node breaks sshd | Hosts | Validate with `sshd -t`, keep the previous config, roll back on failure. | T-09 |
| T12 | Audit tampering or gaps | Audit | Append-only audit stream. Every grant, removal and denied attempt is logged. | T-10 |
| T13 | Licence breach through bundling Teleport | Legal | Never bundle. Document that the operator installs it. Re-check the headcount and ARR thresholds at each quarter. | Process control |
| T14 | Agent or bot principal obtains a human role, a `root` login or a prod label | Hosts | Mapping applies to human GitHub users only. Bot, App and machine accounts are excluded by an explicit deny list and by account type. Spec role matrix: AI build agent is sandbox-only, SRE AI agent is read-only. No role mapped from a team may carry `root` or a prod label for agent principals. | T-12 |
| T15 | GitHub org owner or team maintainer edits a mapped team and thereby grants SSH roles | Hosts | Restrict who can edit mapped teams (owners only, named). Require org-level 2FA. Audit membership changes (GitHub audit log, org webhooks). Prod roles are reachable only via an access request, never by direct team mapping. Dev/staging roles may map directly. | T-13 |
| T16 | Forged or unverified GitHub org webhook (team or membership events) | Role state | Verify `X-Hub-Signature-256` HMAC over the raw body with a constant-time compare. Reject missing signature, bad signature and replayed delivery IDs. Webhooks only trigger a re-check against the GitHub API, they are never the source of truth. | T-14 |
| T17 | Outdated policy cache, or a disabled user resumes a detached tmux session | Hosts | Policy cache has a maximum age and is invalidated on webhook or deprovision. Reattach to a Nexus-managed stream requires fresh `authorize()`. The remote tmux process keeps running (Nexus cannot kill it, stated in the UI). Access to the stream is denied. | T-15 |
| T18 | Credentials leak into session recordings | Audit, recordings | Recordings are access-controlled and encrypted at rest. Redaction rules for known secret patterns. Warn users that typed passwords echo-off are not captured but pasted or printed secrets are. Retention limit. | T-16 |
| T19 | Several accounts or aliases of one person approve the same request | Prod | Approver identity is the verified human (MFA-bound), deduplicated across linked accounts. Two approvers must be distinct humans and neither the requester. Provider-level: CE has no dual auth, so Nexus ledger records it and gates only Nexus-mediated actions. | T-17 |
| T20 | GitHub API or OAuth outage during login or team lookup | Availability, authz | Fail closed. No cached team membership may create a new grant. Existing grants end at cert expiry. Break-glass is a documented human procedure, not an automatic bypass. | T-18 |
| T21 | Teleport Auth or Proxy unreachable | Availability, authz | No new certs can be issued. Existing sessions: documented per observed behaviour (TTL-bound). Nexus must not fall back to direct SSH or cached keys. | T-19 |

## 6. Identity and revocation workflow (design)

1. **Login.** The browser is redirected to GitHub (or Keycloak). The callback checks `state`. Nexus reads org and team membership with `read:org`. The result becomes a short-lived Nexus session. No reusable provider admin credential reaches the browser.
2. **Role mapping.** `org/team-slug` maps to a limited role. If no mapping matches, deny. Dual roles resolve to the union of allows, with explicit deny winning.
3. **Connect.** `authorize(user, host labels, login, time)` returns a `PolicyDecision`. If allowed, `issueEphemeralSession()` returns a cert with a TTL that is no longer than both the role and the approval window.
4. **Elevation (JIT).** CE: the user runs a CLI role request and a named admin approves it with `tctl`. Enterprise: a reviewer approves, with dual authorization for prod. Nexus ledger: records the request digest and approvers. It can gate Nexus-mediated actions but never grants SSH on its own.
5. **Offboarding.** (a) Disable the GitHub membership or team mapping. (b) Provider revoke: Enterprise lock, or CE/step-ca TTL expiry. (c) Nexus detaches interactive streams it controls. (d) Audit the event with the latest-possible-end time. Previously running remote processes are not killed by Nexus and must be stated as such in the UI.
6. **Reconnect.** Always re-authorize and re-issue. A cached cert is never trusted for a reattach after the grant changed.

## 7. Test plan for the missing hands-on step (T-xx maps to §5)

Environment: disposable local containers (two sshd targets, one provider), a throwaway GitHub org with two test accounts and two teams, and no real credentials. **Needs board approval for a container host before running.**

| ID | Test | Expected |
|---|---|---|
| T-01 | Callback with a wrong or missing `state`, or a replayed code | Denied, audited |
| T-02 | Inspect logs, responses and browser storage for tokens | None found |
| T-03 | Remove the test user from the team, wait for TTL, reconnect. On Enterprise also lock. | New cert denied. CE: the existing cert works until expiry. **Measure and record the actual exposure window.** Enterprise lock: session terminated within seconds. |
| T-04 | A user with only GitHub repo access tries SSH | Denied |
| T-05 | Requester approves own request. An AI principal approves. | Denied, audited |
| T-06 | Replay an approval, change the host fingerprint, expired approval | Denied |
| T-07 | Developer attempts direct SSH with their own key, contractor reaches another host, auditor runs a command | All denied and audited |
| T-08 | Cut the network for over 30 min, deprovision the user, reconnect | Denied |
| T-09 | Enroll a node with an invalid sshd config | Rolls back and the node stays reachable |
| T-10 | Check the audit stream for each of the above | Complete events, no secrets |
| T-11 | **CE `tctl lock` exists or not?** Run it on the CE container. | Resolves the conflict flagged in §2. |
| T-12 | Bot/App/agent account in a mapped team requests a cert; request `root` and a prod label | Denied, audited |
| T-13 | Non-owner edits a mapped team; owner edits it. Check org 2FA setting and that prod roles are not directly mapped | Non-owner denied. Change appears in audit. Prod needs a request |
| T-14 | Send webhooks with missing, wrong and replayed signatures | All rejected and logged. Valid one only triggers a re-check |
| T-15 | Disable user, then reattach a detached tmux session through Nexus, and use a stale policy cache | Stream access denied. Remote process state documented |
| T-16 | Print and paste a canary secret in a recorded session | Result recorded as-is. Confirm redaction and access controls, document the gap |
| T-17 | Two aliases of one human approve one prod request | Second approval does not count |
| T-18 | Block GitHub API/OAuth during login and team lookup | Login denied, no new grant, existing grant ends at TTL |
| T-19 | Stop Teleport Auth, then Proxy | No new certs. Record behaviour of live sessions. No direct SSH fallback |

## 8. Recommendation (for C1 and board decision)

1. **Proceed with Teleport CE as the Phase-1 access provider, conditional on three things.** (a) The board confirms headcount below 100 and ARR below US$10M, and records a re-check trigger. (b) Nexus never bundles or redistributes Teleport. (c) The board accepts the CE gaps: no dual authorization and no UI for requests, so prod elevation is CLI plus `tctl` by a human, and revocation may be TTL-bound.
2. **Do not buy Enterprise now.** Request a quote only as a trigger-based option: the company crosses a threshold, the board requires dual authorization or immediate lock for prod, or a non-GitHub IdP is needed. Cost is unknown and must not be assumed to fit the USD 300/month cap.
3. **Keycloak + step-ca stays the open-source exit path.** It gives up recording, RBAC and audit, which Nexus would have to build. Do not choose it now. Keep the `AccessProvider` interface neutral so it remains possible.
4. **Do not rely on the §2 lock claim until T-11 passes.** If CE has no lock, set a short role TTL (candidate values, **board decision**: 1h for prod, 8h for dev) and state the exposure window in the UI.
5. Write an ADR after the lab run. Inconsistencies I-1 to I-7 from the EZF-2 plan were not reviewed here. Flag any that this ADR depends on.

## 9. Sources (all fetched 2026-11-10 via the research tooling)

- https://goteleport.com/docs/feature-matrix/ (CE vs Enterprise matrix)
- https://goteleport.com/docs/identity-governance/access-requests/oss-role-requests/ (CE role requests)
- https://goteleport.com/docs/zero-trust-access/sso/integrate-idp/github-sso/ (GitHub SSO)
- https://goteleport.com/docs/identity-governance/locking/ (locks, shown as Enterprise)
- https://github.com/gravitational/teleport/discussions/39158 (CE licence change, 2024-03-08)
- https://goteleport.com/pricing/ (no public Enterprise price)
- https://smallstep.com/docs/step-ca/provisioners/ (SSH provisioners, renewal and revocation)
- step-ca licence and passive revocation: smallstep/certificates README (https://github.com/smallstep/certificates) via search result. Not fetched directly, so C1 should confirm.
- Keycloak Apache-2.0, GitHub brokering and token/session revocation: search results only (https://www.keycloak.org/docs/, https://cncf.io/blog/2023/04/11/keycloak-joins-cncf-as-an-incubating-project). **Not fetched directly. C1 should verify.**
- Repo: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/TELEPORT_IDENTITY_ACCESS.md`, `CLEAN_ROOM_RESEARCH_PLAYBOOK.md`, `SECURITY_GATES_V3.md`.

## 10. License ledger entries (proposed)

| Dependency | Licence | Use | Bundled? |
|---|---|---|---|
| Teleport CE 16+ | Commercial (under 100 employees, under US$10M ARR; no resale or embedding) | External, operator-installed | **No** |
| Keycloak | Apache-2.0 | Optional alternative | No (not yet adopted) |
| step-ca | Apache-2.0 | Optional alternative | No (not yet adopted) |
