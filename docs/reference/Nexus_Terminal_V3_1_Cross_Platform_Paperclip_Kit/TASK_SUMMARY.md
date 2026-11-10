# V3.1 dependency-linked issue graph

**145 issues across 11 phases**, each phase with an enforced phase gate. 102 inherited baseline + 43 new/updated cross-platform, terminal editing, and Teleport identity tasks.

- P00: Product and OSS research — 15 issues
- P01: Repository, data and identity — 15 issues
- P02: SSH terminal core and mounts — 15 issues
- P03: Signed connector and outbound relay — 17 issues
- P04: Agent session harness and durable jobs — 13 issues
- P05: Approval engine and mobile notifications — 11 issues
- P06: Fleet VM software management — 12 issues
- P07: MCP, skills and plugins — 10 issues
- P08: Dashboard UX and application flows — 10 issues
- P09: Quality, chaos, security and hardening — 15 issues
- P10: Staging, release and handover — 12 issues

Each gate depends on *all* tasks in its phase. A phase begins after the previous gate. A7 Terminal and A8 Identity are real assigned roles. `seed_paperclip_v3_1.py` dry-run validates the graph; `--apply --confirm-create-issues` actually creates issues on your instance, which has not been done.
