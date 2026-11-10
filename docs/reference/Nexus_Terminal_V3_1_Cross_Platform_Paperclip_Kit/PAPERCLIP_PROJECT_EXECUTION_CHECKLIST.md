# Paperclip V3.1 operator checklist

## 0. Confirm board is ready
- [ ] Create company/project and private repository; add agents only against **isolated, disposable** dev and staging VMs.
- [ ] Create nine agents A0–A8 with names/models and instructions in `PAPERCLIP_AGENT_CONFIGURATION_V3.md` and `agents/`.
- [ ] Confirm Paperclip Runner or Legacy adapter supported on host OS and CPU; see `CROSS_PLATFORM_PRODUCT_CONTRACT.md` and https://docs.paperclip.ing/reference/adapters/paperclip-runner/.
- [ ] Configure per-agent budgets, concurrency, and PR-only write access; remove direct prod SSH credentials and deny root.
- [ ] A5 verifies all draft skills before installing; install `ethical-reverse-engineering` for A1/A8 and platform skill for A6/A2/A5; grant tools based on least privilege.

## 1. Attach project documentation
- [ ] Copy `templates/PAPERCLIP_MASTER_KICKOFF.md` into the project goal and/or kickoff issue.
- [ ] Attach `MASTER_BUILD_PLAN_V3.md` and `CROSS_PLATFORM_PRODUCT_CONTRACT.md` as **project** documents; commit them to the repo.
- [ ] Attach `WARP_STYLE_EDITOR_SPEC.md` to the editor planning issue (A7).
- [ ] Attach `TELEPORT_IDENTITY_ACCESS.md` to the access planning issue (A8).
- [ ] Attach `CLEAN_ROOM_RESEARCH_PLAYBOOK.md` and `OSS_RESEARCH.md` to the research planning issue (A1).
- [ ] Attach `deploy/HOST_CONNECTOR_INSTALLER_STRATEGY.md` and `CONNECTOR_INSTALL_APPROVAL.md` to connector planning issue (A6/A8).
- [ ] Attach `compat/supported-platforms.yaml` and `compat/COMPATIBILITY_TEST_MATRIX.md` to OS compatibility/QA issues (A6/A5).
- [ ] Attach `deploy/DEPLOY_ON_MACOS.md` and `deploy/DEPLOY_ON_LINUX.md` to deployment epic (A6).
- [ ] Attach `SECURITY_GATES_V3.md`, `SECURITY_APPROVAL.md` to security/approval epic (A5).
- [ ] Attach `SESSION_PERSISTENCE.md`, `NOTIFICATIONS.md` to sessions/notification epics (A3/A4).
- [ ] Add `BACKLOG.csv`, `BACKLOG.json` and the project kit ZIP to kickoff issue as artifacts.
- [ ] Commit all source documents, role prompts and skills to a versioned repository; prohibit secrets.

## 2. Seed and review tasks
- [ ] `python3 seed_paperclip_v3_1.py` — dry-run, no network mutation.
- [ ] Inspect all tasks, dependencies, owner mapping and C1/C2 review policies.
- [ ] Create the nine agents in Paperclip manually; record their IDs locally in a protected operator env file (see template); these IDs are not fabricated by the script.
- [ ] Only after board-level authorization, run `python3 seed_paperclip_v3_1.py --apply --confirm-create-issues`; the script calls Paperclip API and may wake agents.
- [ ] In Paperclip, verify 145 issues and that gates are blocked until every phase task is independently accepted. If your Paperclip version rejects API payloads, STOP and reconcile with current docs before retrying. Do not auto-grant admin to 'make it work'.
- [ ] Attach issue-specific docs, and set workspaces/agent skills; task seeder does not upload documents.

## 3. Development and release
- [ ] Complete P00 comparative research and legal/license audit with signed-off ADRs.
- [ ] Complete P01 security/identity and cross-platform CI; A5 signs C1.
- [ ] Complete P02 smart terminal editor; confirm command text edit in middle and TUI correctness.
- [ ] Complete P03 Mac `.pkg`/launchd and Linux `.deb`/`.rpm`/systemd; verify consent gates on disposable hosts.
- [ ] Complete P04 ACP agent process and session lifecycle; mark resumed vs reattached correctly.
- [ ] Complete P05/P06 approvals, notifications, VM/package operations; no production change without human consent.
- [ ] Complete P07/P08 MCP/skills catalog and responsive dashboard.
- [ ] Complete P09 OS hardware matrix, revoke-during-disconnect test, 24h reconnection chaos, signature abuse tests.
- [ ] Complete P10 staging and human-authorized release, rollback rehearsal, operator handover.

## 4. Final acceptance standard
- No released OS/version/CPU listed as 'supported' without test evidence.
- No expired/revoked user can join session on reconnect even if tmux process still exists.
- No sensitive connector action runs from push notification alone.
- No unsent command replays after reconnect; no silent agent tool escalation.
- Backups restore; metrics/notifications work; macOS and Linux installs are signed and tested.
