# @nexus/agent-sessions (dev only)

Agent-session registry for the M-D1 demo, with a **mock** harness. No real agent runs.

- **Lifecycle:** `created → starting → running ⇄ needs_input → stopping → exited | failed` (`src/lifecycle.ts`). The contract v0 state set is coarser: `stopping` shows as `running`, `failed` as `exited` (exit code 1 plus an output line saying why), and an exit after a stop as `stopped`.
- **Persistence:** plain files under the dev data dir (`NEXUS_DEV_DATA_DIR`, default `.nexus-dev-data/`): `agent-sessions/<id>/meta.json` and append-only `events.jsonl`. SQLite was not needed at this scale and would add a native dependency.
- **Events:** seq-numbered from 1, contiguous, assigned only by the registry, persisted before delivery. Resume with `afterSeq`.
- **Recovery (`registry.recover()`):** the adapter is asked whether the _same_ process is alive.
  - alive → `continuity: reattached`; events produced while the registry was down are delivered once, in order.
  - gone, adapter can resume and a checkpoint exists → new process, `continuity: resumed`.
  - otherwise → `failed`. A restored session is never presented as the original process.
- **Mock limits:** the mock runs inside the Node process, so a real API restart always takes the resumed or failed path. Reattach is exercised by re-creating the registry over the same adapter instance. The needs_input pause ends on a timer because contract v0 has no input route.
