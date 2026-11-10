# Nexus Terminal — License and Dependency Compatibility Ledger

| Field | Value |
|---|---|
| Backlog / issue | NX2-005 · EZF-5 (Epic E00, M0/P00) |
| Author | A1 Nexus CTO / Research Architect |
| Review routing | C1: A5 QA & Security Reviewer · C2: A0 Nexus CEO · Legal sign-off: **human counsel, not yet performed**, tracked in [EZF-24](/EZF/issues/EZF-24) (§7) |
| Evidence date | 2026-11-10 (UTC). Per-row timestamps are in `license-ledger.csv` → `verified_utc` |
| Machine-readable | [`license-ledger.csv`](license-ledger.csv) · raw evidence [`license-evidence/evidence.json`](license-evidence/evidence.json) |
| Tooling | `tools/license-ledger/{fetch_evidence,build_ledger,check_ledger}.py` + `decisions.json` |

> This ledger records engineering due diligence. It is **not legal advice**. Rows marked `adopt` are cleared for licence compatibility only. Whether we actually use a component is still decided by its own ADR.

## 1. Scope and method

**Scope:** every component in EZF-2 plan §5.1, the MinIO replacement candidates, and the
host prerequisites and references in `OSS_RESEARCH.md` (tmux, OpenSSH, Zellij, Prometheus), plus the two components treated as proprietary in the spec (Warp, Claude Code). That is 47 rows.
Items that were superseded (the archived codemirror/dev repo, the archived zed-industries/codex-acp repo) keep their own rows, so the move is
recorded with evidence.

**Method (reproducible, no credentials, no GitHub API quota):**
1. `fetch_evidence.py` resolves `HEAD` and the newest stable release tag with `git ls-remote`.
   It pins the **release-tag commit**, or `HEAD` when no stable tag exists or the repo is archived.
2. At the pinned commit it probes the repo root for every common licence/notice filename, plus
   component-specific paths (e.g. Teleport `api/LICENSE` and `build.assets/LICENSE-community`).
   It downloads each hit from `raw.githubusercontent.com` (or the Forgejo `raw/commit` URL for CodeMirror).
3. Each file is SHA-256 hashed. SPDX IDs are detected from canonical licence phrases.
4. The primary licence file is fetched again at `HEAD` to flag relicensing drift since the pin.
5. The GitHub repo page is checked for the archive banner.
6. Some facts can't be seen in a LICENSE file: `-only` vs `-or-later`, the Teleport CE binary terms,
   dual-licence elections, and repo moves. These were checked against source headers, package manifests,
   READMEs and vendor pages. They are cited in the row `notes` and in §8.
7. `build_ledger.py` merges the hand-written judgements (`decisions.json`) with the evidence.
   `check_ledger.py` then enforces scope coverage, commit/sha256 consistency, SPDX-vs-evidence agreement
   and the policy rules (§6). `--selftest` proves each rule fires on a mutated ledger.

**SPDX `-only` / `-or-later` rule:** where upstream gives no "or any later version" grant, we record
`-only`. It is the conservative reading.

## 2. Recommendation vocabulary

| Value | Meaning |
|---|---|
| `adopt` | Licence-compatible with an open-source Nexus release. May be used as a library, bundled component or host prerequisite, provided the notice obligations are met. |
| `external-service-only` | May run only as a **separate, unmodified, operator-installed** service or CLI, reached over a network protocol or process boundary. Never linked, vendored, copied, bundled or redistributed in Nexus artefacts. |
| `reject` | Not used in Nexus (neither code nor service). Clean-room study of public behaviour is still allowed under `CLEAN_ROOM_RESEARCH_PLAYBOOK.md`. Also used for superseded or archived source locations. |

## 3. Notice-obligation shorthands (used in the CSV)

| Shorthand | Obligation when Nexus redistributes the component (source or binary) |
|---|---|
| `MIT` | Keep the copyright line and permission notice in all copies or substantial portions. For bundled web assets, put them in `THIRD_PARTY_NOTICES`. |
| `APACHE` | Ship a copy of Apache-2.0. Reproduce the upstream `NOTICE` content (where present) in attribution docs. Mark modified files as changed. No trademark grant. |
| `BSD3` | Keep the copyright notice, conditions and disclaimer in source and in binary documentation. Do not use contributor names to endorse. |
| `ISC` | Keep the copyright and permission notice. |
| `AGPL` | Distributing or *offering a modified version over a network* requires releasing Corresponding Source under AGPL-3.0 (s.13). Linking or copying makes the combined work AGPL. |

## 4. Ledger summary

The table is generated from `license-ledger.csv`; do not edit it by hand. Commit links point to the primary licence file at the pinned commit.

<!-- ledger-table:start -->
| ID | SPDX | Pinned ref @ commit | Network copyleft | Recommendation |
|---|---|---|---|---|
| teleport | `AGPL-3.0-or-later AND Apache-2.0 AND LicenseRef-Teleport-CE` | `v18.11.1` @ [`27eb07217a0e`](https://raw.githubusercontent.com/gravitational/teleport/27eb07217a0efca4a5d2dd88bce7472cba5f406a/LICENSE) | YES | **external-service-only** |
| termix | `Apache-2.0` | `v26.11.1` @ [`92e16524a9bc`](https://raw.githubusercontent.com/Termix-SSH/Termix/92e16524a9bc2e72a276911a1321090f1c2f725f/LICENSE) | NO | **adopt** |
| herdr | `Apache-2.0` | `v0.9.5` @ [`2ecf19a92fc3`](https://raw.githubusercontent.com/herdrdev/herdr/2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01/LICENSE) | NO | **adopt** |
| happier | `MIT` | `HEAD` @ [`7b37d65ca75e`](https://raw.githubusercontent.com/happier-dev/happier/7b37d65ca75e58560f8f3ca850958ac5407d2e75/LICENCE) | NO | **adopt** |
| hapi | `AGPL-3.0-only` | `v0.34.5` @ [`b312641b30b4`](https://raw.githubusercontent.com/tiann/hapi/b312641b30b4650dbe7ebcf826d5e91a692349cf/LICENSE) | YES | **reject** |
| hermes-agent | `MIT` | `v2026.9.24` @ [`f97608f178d1`](https://raw.githubusercontent.com/NousResearch/hermes-agent/f97608f178d1ffeca59860195ab7da295f7c8e5f/LICENSE) | NO | **adopt** |
| opencode | `MIT` | `v2.2.7` @ [`fedc6f208aa2`](https://raw.githubusercontent.com/anomalyco/opencode/fedc6f208aa2bd54c1019227214568083f6380ad/LICENSE) | NO | **adopt** |
| codex-cli | `Apache-2.0` | `rust-v0.167.0` @ [`086ccc833bc9`](https://raw.githubusercontent.com/openai/codex/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/LICENSE) | NO | **adopt** |
| codex-acp | `Apache-2.0` | `v2.6.0` @ [`f3208913693b`](https://raw.githubusercontent.com/agentclientprotocol/codex-acp/f3208913693bd4d5171d6c6b9be5ec1ff96c6431/LICENSE) | NO | **adopt** |
| codex-acp-zed-archived | `Apache-2.0` | `v0.16.0` @ [`bb590500e864`](https://raw.githubusercontent.com/zed-industries/codex-acp/bb590500e8646f6daf879b8b3c6a659fbd29017d/LICENSE) | NO | **reject** |
| acp-spec | `Apache-2.0` | `v1.16.0` @ [`759775f6b0a2`](https://raw.githubusercontent.com/agentclientprotocol/agent-client-protocol/759775f6b0a2369886c378d1f64e900175041120/LICENSE) | NO | **adopt** |
| mcp-spec | `Apache-2.0 AND MIT AND CC-BY-4.0` | `HEAD` @ [`632a0c9a65c9`](https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/632a0c9a65c9b4fbc889d8aface5c9cf5edef3b7/LICENSE) | NO | **adopt** |
| toolhive | `Apache-2.0` | `v0.63.0` @ [`01f96bf4d16a`](https://raw.githubusercontent.com/stacklok/toolhive/01f96bf4d16ac1a9fecb0b280c520d433fcf0221/LICENSE) | NO | **adopt** |
| temporal | `MIT` | `v1.32.2` @ [`6d085822273f`](https://raw.githubusercontent.com/temporalio/temporal/6d085822273f4336796e6959c73ab1d14a23eb77/LICENSE) | NO | **adopt** |
| minio | `AGPL-3.0-or-later` | `RELEASE.2025-10-15T17-29-55Z` @ [`9e49d5e7a648`](https://raw.githubusercontent.com/minio/minio/9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a/LICENSE) | YES | **reject** |
| seaweedfs | `Apache-2.0` | `4.53` @ [`4ab66fb76da8`](https://raw.githubusercontent.com/seaweedfs/seaweedfs/4ab66fb76da83700739f5839e62fcaf15fb7d02a/LICENSE) | NO | **adopt** |
| garage | `AGPL-3.0-only` | `v2.5.0` @ [`586726edb017`](https://raw.githubusercontent.com/deuxfleurs-org/garage/586726edb0170bb46f604e84fba09e5659610649/LICENSE) | YES | **external-service-only** |
| rustfs | `Apache-2.0` | `1.0.4` @ [`46337942d55f`](https://raw.githubusercontent.com/rustfs/rustfs/46337942d55f3a8e6a97b147ca98d9ea8115555d/LICENSE) | NO | **adopt** |
| versitygw | `Apache-2.0` | `v1.11.0` @ [`e42ae7ab8107`](https://raw.githubusercontent.com/versity/versitygw/e42ae7ab8107201e64e52ee024824e8cab3683b3/LICENSE) | NO | **adopt** |
| ceph | `LGPL-2.1-only OR LGPL-3.0-only` | `v22.0.0` @ [`90b50e9b8799`](https://raw.githubusercontent.com/ceph/ceph/90b50e9b87998f8a55e36e3db7852be0b1ca8cbb/COPYING) | NO (LGPL has no network clause) | **external-service-only** |
| valkey | `BSD-3-Clause` | `9.1.3` @ [`29173b67508b`](https://raw.githubusercontent.com/valkey-io/valkey/29173b67508b2de4c0f0ed551f3b47cf19fc3ca8/COPYING) | NO | **adopt** |
| redis | `LicenseRef-RSALv2 OR SSPL-1.0 OR AGPL-3.0-only` | `8.10.3` @ [`1a2574ce1551`](https://raw.githubusercontent.com/redis/redis/1a2574ce1551d3de6e0b4a56756c0fdbc6659e4f/LICENSE.txt) | YES | **reject** |
| grafana | `AGPL-3.0-only AND Apache-2.0` | `v13.3.0` @ [`752e3462ff71`](https://raw.githubusercontent.com/grafana/grafana/752e3462ff71a43a5c1fb62d00a482fa2dc0ee6a/LICENSE) | YES | **external-service-only** |
| prometheus | `Apache-2.0` | `v3.16.0` @ [`e2e28adeee2c`](https://raw.githubusercontent.com/prometheus/prometheus/e2e28adeee2c5883d000fc82aca6008cfbf7e96d/LICENSE) | NO | **adopt** |
| ntfy | `Apache-2.0 OR GPL-2.0-only` | `v2.37.2` @ [`05109571fd09`](https://raw.githubusercontent.com/binwiederhier/ntfy/05109571fd0931affb6f92b17bbfd62c4d2ea68a/LICENSE) | NO (under the Apache-2.0 branch) | **adopt** |
| gotify | `MIT` | `v3.1.1` @ [`e6361caa5125`](https://raw.githubusercontent.com/gotify/server/e6361caa512547052b1013dbf4544e6d7ff32604/LICENSE) | NO | **adopt** |
| headscale | `BSD-3-Clause` | `v0.29.7` @ [`c9cf210b8bc8`](https://raw.githubusercontent.com/juanfont/headscale/c9cf210b8bc84d13177e18b91f555788a44b47b6/LICENSE) | NO | **adopt** |
| xtermjs | `MIT` | `6.0.0` @ [`f447274f430f`](https://raw.githubusercontent.com/xtermjs/xterm.js/f447274f430fd22513f6adbf9862d19524471c04/LICENSE) | NO | **adopt** |
| codemirror-view | `MIT` | `6.43.15` @ [`da63d53a7b1f`](https://code.haverbeke.berlin/codemirror/view/raw/commit/da63d53a7b1f9011a09481f5fa2397294104d73a/LICENSE) | NO | **adopt** |
| codemirror-state | `MIT` | `6.7.6` @ [`651084c8a322`](https://code.haverbeke.berlin/codemirror/state/raw/commit/651084c8a322b3a19b2bb3e00eee7d4a61d641af/LICENSE) | NO | **adopt** |
| codemirror-dev-archived | `MIT` | `HEAD` @ [`c010426d0668`](https://raw.githubusercontent.com/codemirror/dev/c010426d06689a7115aa9df08425126b6d3ead2f/LICENSE) | NO | **reject** |
| tauri | `Apache-2.0 OR MIT` | `tauri-v2.12.5` @ [`993038c49185`](https://raw.githubusercontent.com/tauri-apps/tauri/993038c49185307dfc895ab7657d77ca0d5ed7c7/LICENSE-MIT) | NO | **adopt** |
| keycloak | `Apache-2.0` | `26.8.2` @ [`e514445f9dcd`](https://raw.githubusercontent.com/keycloak/keycloak/e514445f9dcdabc5bdcf67cab56c1e49655de067/LICENSE.txt) | NO | **adopt** |
| step-ca | `Apache-2.0` | `v0.30.2` @ [`6e8ec6140523`](https://raw.githubusercontent.com/smallstep/certificates/6e8ec61405239cf3f37b2bbf260a587b7d2e4e31/LICENSE) | NO | **adopt** |
| guacamole-server | `Apache-2.0` | `1.6.0` @ [`1f664e08feae`](https://raw.githubusercontent.com/apache/guacamole-server/1f664e08feae6e7d15d8146b78acab2e6fb470ae/LICENSE) | NO | **adopt** |
| guacamole-client | `Apache-2.0 AND BSD-3-Clause` | `1.6.0` @ [`0537c89cd783`](https://raw.githubusercontent.com/apache/guacamole-client/0537c89cd783681b986ff8f8c4e0b97ec6873371/LICENSE) | NO | **adopt** |
| meshcentral | `Apache-2.0` | `1.3.1` @ [`f43614352745`](https://raw.githubusercontent.com/Ylianst/MeshCentral/f436143527458d56da0336ea3047c006703fb4e4/LICENSE) | NO | **adopt** |
| paperclip | `MIT` | `v2026.1106.0` @ [`d69631b01b9c`](https://raw.githubusercontent.com/paperclipai/paperclip/d69631b01b9c658f80bf8bed389863dce82643e1/LICENSE) | NO | **adopt** |
| tmux | `ISC` | `3.8` @ [`7f2a35ad3321`](https://raw.githubusercontent.com/tmux/tmux/7f2a35ad3321f9ba57a1062ca73b1f3ff26aca53/COPYING) | NO | **adopt** |
| openssh-portable | `SSH-OpenSSH` | `V_10_6_P2` @ [`d449e662b6b8`](https://raw.githubusercontent.com/openssh/openssh-portable/d449e662b6b8b8cb20e852d8084c269af1c5e8f1/LICENCE) | NO | **adopt** |
| zellij | `MIT` | `v0.45.1` @ [`efd8fd5a89a2`](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/LICENSE.md) | NO | **adopt** |
| waveterm | `Apache-2.0` | `v0.14.5` @ [`97e560027f49`](https://raw.githubusercontent.com/wavetermdev/waveterm/97e560027f494d20fed347b2d6b72b6bcb3e50e0/LICENSE) | NO | **adopt** |
| tabby | `MIT` | `v1.0.238` @ [`54869e108aaa`](https://raw.githubusercontent.com/Eugeny/tabby/54869e108aaa336fdd01bc4de5b160fd8feccf7b/LICENSE) | NO | **adopt** |
| wezterm | `MIT` | `20240203-110809-5046fc22` @ [`5046fc225992`](https://raw.githubusercontent.com/wezterm/wezterm/5046fc225992db6ba2ef8812743fadfdfe4b184a/LICENSE.md) | NO | **adopt** |
| ghostty | `MIT` | `v1.4.0` @ [`83fb95624b04`](https://raw.githubusercontent.com/ghostty-org/ghostty/83fb95624b0439ee660c2679b43b38c8b63769cd/LICENSE) | NO | **adopt** |
| warp | `AGPL-3.0-only AND MIT` | `HEAD` @ [`651109041b4d`](https://raw.githubusercontent.com/warpdotdev/warp/651109041b4dba1ee9f4e4ad94f77245274fc253/LICENSE-AGPL) | YES | **reject** |
| claude-code | `LicenseRef-Anthropic-Commercial-Terms` | `v2.1.322` @ [`6e1e44f6433b`](https://raw.githubusercontent.com/anthropics/claude-code/6e1e44f6433bfa17d198e932bff53373aa229eea/LICENSE.md) | NO | **external-service-only** |
<!-- ledger-table:end -->

Totals: **36 adopt · 5 external-service-only · 6 reject** (47 rows). The per-row redistribution limits, alternatives and notes are in the CSV.

## 5. Findings that change or sharpen plan §5.1

| # | Finding | Evidence | Action |
|---|---|---|---|
| F1 | **Warp is no longer purely proprietary.** `warpdotdev/warp` publishes the client under **AGPL-3.0-only** (Cargo.toml). The `warpui_core`/`warpui` crates are **MIT** (README "Licensing"). | `LICENSE-AGPL`, `LICENSE-MIT` at the pinned HEAD; README | The clean-room rule stays and no Warp code or assets are reused (`reject`). **The spec text "Warp is proprietary" (MASTER_BUILD_PLAN_V3 §License caveats, plan §5.1) is outdated.** A0 should log a spec erratum. Reusing the MIT `warpui` crates would need an ADR plus board approval. |
| F2 | **codex-acp moved.** `zed-industries/codex-acp` was archived on 2026-07-22. Development continues at `agentclientprotocol/codex-acp` (npm `@agentclientprotocol/codex-acp`), now built on the Codex App Server. | Archive banner; README of the old repo | NX4-157 must pin the new repo and package. The licence is unchanged (Apache-2.0). |
| F3 | **Happier's licence is confirmed.** `LICENCE` (British spelling) is MIT at the pinned commit. The repo has no stable release tags and `package.json` has no `license` field. | `LICENCE` sha256 in CSV | Closes the plan's open item. Pin by commit. |
| F4 | **MinIO:** the repo was archived on 2026-04-25. The last community tag is `RELEASE.2025-10-15T17-29-55Z`. Source headers say AGPL-3.0-**or-later**. | Archive banner; source header | `reject` confirmed. Replacement candidates are licence-cleared: SeaweedFS, Versity S3 Gateway and RustFS (Apache-2.0). Garage (AGPL) and Ceph (LGPL) are external-service-only. Final pick is in the infra ADR. |
| F5 | **CodeMirror:** `codemirror/dev` on GitHub was archived on 2026-04-15. The packages now live at `code.haverbeke.berlin/codemirror/<pkg>` (Forgejo). Still MIT. | Archive banner; Forgejo LICENSE | Pin `@codemirror/*` by version. Verify source against the new host. |
| F6 | **Teleport:** the source `LICENSE` is AGPL-3.0 (headers: "or any later version"). `api/LICENSE` is Apache-2.0. `build.assets/LICENSE-community` at the pinned v18 tag contains the CE terms: <100 employees **and** <US$10M revenue, no resale or embedding. | Files at pinned tag; goteleport.com blog | `external-service-only` confirmed. D3 (company size) is still needed. |
| F7 | **MCP spec licence is mid-transition** from MIT to Apache-2.0. Non-spec docs are CC-BY-4.0. | `LICENSE` preamble | Recorded as `Apache-2.0 AND MIT AND CC-BY-4.0` until the transition completes. |
| F8 | **Valkey head drift:** `COPYING` at HEAD merges two BSD-3-Clause blocks into one. No change of licence. | `head_drift` in evidence | None. The drift detector works as intended. |
| F9 | **ntfy** is `Apache-2.0 OR GPL-2.0-only`. The GPL-2.0-only branch is incompatible with Apache-2.0 code. | `README.md` line 344; `LICENSE.GPLv2` | Elect Apache-2.0 (recorded as a `license_election`, §6) and record the election in `THIRD_PARTY_NOTICES`. |
| F10 | **WezTerm's newest stable tag is from 2024-02-03.** Only nightlies since. | `git ls-remote` tags | Use it as a reference only. Do not depend on it. |
| F11 | Fast release cadence: HAPI moved v0.34.4 → v0.34.5 between two evidence runs on the same day. | evidence runs | Pins go stale quickly. Re-run `fetch_evidence.py` at every dependency bump (§9). |

## 6. AGPL / network-copyleft and redistribution rules (enforced by `check_ledger.py`)

1. **Never `adopt`** a row whose every licence branch includes AGPL, SSPL, RSAL (`LicenseRef-RSALv2`;
   RSALv2 is not on the SPDX License List), BUSL or a `LicenseRef-` (proprietary or custom) term. Allowed outcomes: `external-service-only` or `reject`.
2. **Never `adopt`** an archived upstream.
3. Fixed decisions from the plan and agent rules: Teleport = `external-service-only`, Grafana =
   `external-service-only` (no AGPL code reuse), MinIO = `reject`, Redis = `reject`, Warp = `reject` (clean-room
   rule, F1), Valkey = `adopt`, HAPI = `reject`.
4. The SPDX expression must agree with what the evidence actually detected in upstream licence files,
   **in both directions**:
   - every ID in the expression must have been detected upstream;
   - every GPL-family (GPL/LGPL/AGPL), SSPL, RSAL, BUSL or `LicenseRef-` licence detected in *any* licence file
     must appear in the expression, or `decisions.json` must record a `license_carveouts` entry
     (licence, file, reason). Each carve-out is bound to that file's sha256 and to the recommendation it was
     reviewed under. If upstream changes the file, or the row's recommendation changes, the check fails until
     the carve-out is reviewed again. Carve-outs that no longer match are reported as stale. The CSV
     `license_carveouts` column shows them. The only carve-out today is Ceph `COPYING`, where AGPL-3.0 applies
     only to the `src/script/backport-*` developer scripts.
   - an `adopt` row whose expression has an `OR` branch with one of those licences must record a
     `license_election` in `decisions.json`: the elected (unrestricted) branch, the upstream file and line that
     grant the choice, that file's sha256, and a reason. Otherwise writing `OR` where upstream means `AND` would
     pass rule 1. The election is bound to the file sha256 and the recommendation in the same way as a carve-out,
     and stale elections fail. The CSV `license_election` column shows it. The only election today is ntfy
     (Apache-2.0, `README.md` line 344, F9). The grant file is fetched as evidence like any licence file.
5. `pinned_commit`, `pinned_ref` and `primary_license_sha256` must match the evidence file.

Architecture boundary for `external-service-only` (Teleport, Grafana, Garage, Ceph, Claude Code):
- Integrate only via documented network APIs or CLIs (Teleport gRPC/`tctl` via the Apache-2.0 `api` module, Grafana HTTP, S3).
- Never copy code into Nexus. Never ship patched builds. Never include their binaries or container images in Nexus
  packages (`.deb`/`.rpm`/`.pkg`/OCI) or installers. Operators install them from the vendor.
- Nexus docs may link to vendor install instructions. They must state the vendor's terms (Teleport CE size limits).

## 7. Legal review status (acceptance criterion: "legal review")

**Not performed. Tracked in [EZF-24](/EZF/issues/EZF-24) (human-only).** No agent is qualified to give legal
sign-off, and none may self-approve it. C2 can accept this ledger as the engineering deliverable, but legal
sign-off stays **pending** until a human answers EZF-24. Before any external release, a human with legal
authority must review these questions:

1. **Nexus outbound licence.** Not yet chosen (no ADR). All `adopt` rows are compatible with Apache-2.0 or MIT
   as the outbound licence (subject to the ntfy Apache election, F9). Choosing AGPL for Nexus would change the HAPI and Warp outcomes.
2. **Teleport CE eligibility** of the operating organisation (D3), and whether Nexus *documenting* CE
   installation counts as "embedding in products or services".
3. Whether **Warp's MIT `warpui` crates** may be considered at all, given the spec's clean-room prohibition (F1).
4. **Trademark** use in docs and UI (Teleport, Warp, Grafana, Tailscale/Headscale, OpenAI, Anthropic). This ledger covers copyright licences only.
5. Model-provider **terms of service** (Anthropic, OpenAI and others) for harness adapters. Out of scope here.

## 8. Sources (retrieved 2026-11-10)

- Per-component licence files: the exact URL at the pinned commit and its sha256 are in `license-ledger.csv`
  (`primary_license_url`, `primary_license_sha256`). Every licence/notice file found is listed in
  `license-evidence/evidence.json`.
- Teleport CE terms: <https://goteleport.com/blog/teleport-community-license/> and
  `build.assets/LICENSE-community` at the pinned tag. Cross-check: ScanCode LicenseDB
  `teleport-ce-2024` (<https://scancode-licensedb.aboutcode.org/teleport-ce-2024.html>).
- Teleport AGPL "or later" grant: `lib/auth/auth.go` header at the pinned tag.
- MinIO AGPL "or later" grant: `cmd/server-main.go` header at the pinned tag.
- HAPI AGPL-3.0-only: `"license": "AGPL-3.0-only"` in `cli/package.json` (`@twsxtd/hapi`), `hub/`, `web/` and
  `relay/package.json` at the pinned `v0.34.5` (`b312641b30`), re-checked 2026-11-10; <https://hapi.run/docs/guide/faq>.
- Ceph AGPL scope: `COPYING` (DEP-5) lines 220-228 at the pinned `v22.0.0` (`90b50e9b87`).
- Garage `AGPL-3.0` (deprecated SPDX id = only): `src/garage/Cargo.toml` at the pinned tag.
- Warp licensing: `README.md` "Licensing" section and `Cargo.toml` (`license = "AGPL-3.0-only"`) at the pinned HEAD.
- codex-acp move: `README.md` of <https://github.com/zed-industries/codex-acp> at its final commit.
- Redis tri-licence and version history: `LICENSE.txt` and `README.md` at the pinned tag.
- ntfy dual licence: `README.md` "License" section, line 344, at the pinned `v2.37.2` (`05109571fd`); file sha256 in `evidence.json`.
- Grafana licence scoping: `LICENSING.md` at the pinned tag.
- CodeMirror new host: <https://code.haverbeke.berlin/codemirror>.
- Hermes Agent `pyproject.toml` (`license = "MIT"`) and Codex CLI `NOTICE` at their pinned tags.

## 9. Reproduce and maintain

```bash
python3 tools/license-ledger/fetch_evidence.py            # ~10-20 min; network only, no credentials
python3 tools/license-ledger/build_ledger.py              # regenerate CSV + §4 table
python3 tools/license-ledger/check_ledger.py --selftest   # exit 0 = consistent and gate rules proven
```

- Refresh one row: `fetch_evidence.py --only <id>[,<id>]`, then rebuild and check.
- New dependencies: add the component to `COMPONENTS` in `fetch_evidence.py`, add a judgement row to `decisions.json`, and add
  its id to `SCOPE` in `check_ledger.py` if it is mandatory.
- **Not covered yet (follow-up):** transitive and package-level dependencies (npm/Go/Rust/Python lockfiles).
  These need an SBOM and licence scan in CI (e.g. Syft + ScanCode/`license-checker`) once code exists. This ledger
  covers the top-level components chosen in M0. Per-package rows are needed for each `@codemirror/*` package, each
  xterm.js addon, the ACP/MCP SDKs, the Temporal UI/SDKs, the step CLI and the Tailscale clients when they are adopted.
