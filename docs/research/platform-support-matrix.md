# Platform support matrix: macOS/Linux hosting, OS/arch tiers and Paperclip Runner compatibility

- Issue: EZF-12 (NX3-103), epic E00 / M0 (P00). Risk: normal. Revised by EZF-90 (NX3-103a): C1 non-blocking fixes and C2 rulings.
- Author: A1 Nexus CTO. C1: A5 QA & Security. C2: A0 Nexus CEO.
- Date: 2026-11-10. Status: **DRAFT for review. A research input, not an ADR and not a support claim.** C2 rulings from EZF-12 are recorded as working positions; they bind only once the ADR from NX4-147 ([EZF-16](/EZF/issues/EZF-16)) records them.
- Inputs: `CROSS_PLATFORM_PRODUCT_CONTRACT.md`, `compat/COMPATIBILITY_TEST_MATRIX.md`, `compat/supported-platforms.yaml` (v0.1-proposed), `deploy/*.md`, EZF-2 plan (decision D5, inconsistency I-3).

## 0. Read this first: what was and was not done

| Item | State |
|---|---|
| Dated OS version / CPU / init matrix from vendor lifecycle data | Done (§2–§5). Sources and fetch dates are in §9. |
| Distro minimums (glibc, kernel, CPU baseline, toolchain floors) | Done (§3, §4). |
| Paperclip Runner fallback cases: **routing decision** | **Validated by execution.** Paperclip's own platform-gate function was run against 114 cases. All 114 match, and two negative controls (floor lowered and raised) fail as expected (§6, `docs/research/evidence/ezf-12/`). |
| Paperclip Runner fallback cases: **Legacy runner actually executing a task** on each fallback distro | **Not done. Unverified.** The run host has no docker or podman, and the task forbids package installs and paid VMs. The lab plan is in §7. |
| Any Nexus feature tested on real macOS or Linux hardware | **None.** Nexus has no code yet. Every cell in `COMPATIBILITY_TEST_MATRIX.md` stays PENDING. Nothing in this document is a support claim. |

Claim labels used below:
- **[doc]**: stated on a fetched vendor or project page.
- **[data]**: taken from machine-readable lifecycle or package data (endoflife.date, Repology, the distro package archives).
- **[source]**: read in the Paperclip source at the hash shown.
- **[executed]**: produced by running code here, with output in the evidence directory.
- **[observed]**: seen on this run host.
- **[inferred]**: my reasoning, not verified.
- **[unverified]**: needs a lab test.

The doc fetcher summarizes pages through a small model, so quotes from fetched pages are secondhand. C1 should re-read the cited sentences on the live pages.

## 1. Summary and recommendation

1. **macOS on Intel is ending.** macOS 27 Golden Gate (released 2026-09-14) supports Apple silicon only **[doc: Apple 127255]**. macOS 26 Tahoe is the last release for Intel, and only a few 2019–2020 Intel models run it **[doc: secondary press, §9]**. So "current plus two previous majors on Apple Silicon **and** Intel" (contract Tier A) can only cover Intel on **15 and 26**. `darwin/amd64` therefore has an end date. **C2 ruling (EZF-12):** darwin/amd64 Tier A covers macOS 15 and 26 only and ends when Apple stops security updates for macOS 26. The contract GA rule still holds: without Intel Mac hardware or CI there is **no darwin/amd64 GA claim**. Binding once the NX4-147 ADR records it.
2. **macOS Tier A today is 27, 26 and 15.** Apple published security updates for all three on 2026-11-09. The last Sonoma 14 update was 2026-08-06 **[doc: Apple 100100]**, and endoflife.date marks 14 EOL on 2026-09-14 **[data]**. Sonoma is Tier C.
3. **Linux Tier A:** Ubuntu 24.04 / 26.04 LTS (22.04 until 2027-06-01), Debian 13, and RHEL/Rocky/Alma 9 and 10, on amd64 and arm64, with systemd. Every Tier A distro uses systemd **[inferred: distro defaults]**, so R1 needs only one Linux init adapter.
4. **The Paperclip Runner has a glibc 2.39 floor** (`PAPERCLIP_RUNNER_MINIMUM_GLIBC_VERSION = "2.39"` **[source]**). Of the Tier A Linux hosts, **Ubuntu 22.04 and RHEL 9 fall back to the Legacy runner** **[executed]**. So do the Tier B hosts Debian 12, RHEL 8 and Amazon Linux 2023, Leap 15.6 (Tier C), Alpine/musl and unknown libc (§3). This only affects where *Paperclip agents* run, not where Nexus runs. Nexus's own Go binaries only need Linux kernel ≥ 3.2 **[doc]**.
5. **The Runner has no macOS version gate.** It accepts any darwin arm64/x64 **[source]**. The effective floor comes from Paperclip's Node ≥ 24.11 requirement **[doc]**: Node 24 needs macOS ≥ 13.5 **[doc]**. Nexus must enforce its own macOS floor (15+) and not rely on the Runner's.
6. **Claude over SSH to a Mac defaults to the Legacy runner** even though the Runner supports darwin (`agent-runner-selection.ts` **[source]**). Any Nexus/Paperclip lab that drives Claude agents on Mac hosts over SSH must choose the runner explicitly and test it.
7. **R1 scope (plan D5, resolves I-3):** R1 ships macOS as SSH/SFTP-only, plus the Linux connector (`.deb`/`.rpm`, systemd) on the Linux Tier A distros. The macOS connector (`.pkg`, launchd, notarization) ships in R1.1. The macOS **control-plane host** stays in R1 because the contract requires it. This needs an Apple silicon test machine, requested through the P01/P09 lab tasks (§7). **C2 ruling (EZF-12): accepted.** Binding once the NX4-147 ADR records it.
8. **C2 rulings from EZF-12 (A0, at `fda5c3b`).** These are working positions for R1 planning. Each becomes binding only when the ADR from NX4-147 ([EZF-16](/EZF/issues/EZF-16)) records it:
   - RHEL 8 is Tier B (§3). This narrows the contract's Tier A wording, so the ADR must state it explicitly.
   - darwin/amd64 sunset as in item 1.
   - D5 / I-3 R1 scope as in item 7.
   - Paperclip agent hosts for dev and CI must have glibc ≥ 2.39 (Ubuntu 24.04+ or Debian 13), so agents stay on the Runner path (§6).

## 2. macOS matrix (as of 2026-11-10)

| macOS | Released | Security updates | CPUs Apple supports | Nexus tier | Control plane (R1) | Remote target R1 | Remote connector |
|---|---|---|---|---|---|---|---|
| 27 Golden Gate | 2026-09-14 **[data]** | Yes, 27.2.1 on 2026-11-09 **[doc]** | Apple silicon only **[doc]** | A | native launchd or container VM; **unverified** | SSH/SFTP; **unverified** | R1.1, launchd + notarized `.pkg` |
| 26 Tahoe | 2025-09-15 **[data]** | Yes, 26.7.3 on 2026-11-09 **[doc]** | Apple silicon + a few Intel models (2019–2020) **[doc: secondary]** | A (arm64), A-limited (amd64) | same; **unverified** | SSH/SFTP; **unverified** | R1.1 |
| 15 Sequoia | 2024-09-16 **[data]** | Yes, 15.8.3 on 2026-11-09 **[doc]** | Apple silicon + Intel **[inferred]** | A | same; **unverified** | SSH/SFTP; **unverified** | R1.1 |
| 14 Sonoma | 2023-09-26 | Last 14.8.9 on 2026-08-06 **[doc]**; EOL 2026-09-14 **[data]** | — | C | Not supported | SSH/SFTP with an EOL warning | Denied by default (`eol_versions: deny_connector_by_default`) |
| ≤ 13 Ventura | — | EOL 2025-09-15 **[data]** | — | C | Not supported | SSH/SFTP with an EOL warning | Denied |

Notes:
- Apple does not publish a formal security-support window. "Supported" here means *received a security release in the last 90 days*. Re-run this test at every Nexus release **[inferred policy proposal]**.
- Init/service manager on all rows: launchd. Use a LaunchDaemon for a pre-login system service and a LaunchAgent for a user service. Paperclip itself installs as a LaunchAgent **[doc: INSTALLING.md]**.
- Shell defaults: zsh. Remote targets need System Settings › Sharing › Remote Login enabled by the owner **[doc: contract]**.
- Toolchain floors: Go 1.26 needs macOS ≥ 12, and Go 1.27 needs ≥ 13 **[doc]**. Node 24 needs ≥ 13.5 **[doc]**. All are below Nexus's proposed floor of 15, so the toolchains do not constrain it. Go 1.28 (expected around Feb 2027) may raise the floor **[unverified]**. Check its release notes before upgrading.

## 3. Linux matrix (as of 2026-11-10)

`glibc` comes from the distro package archives and Repology **[data]**. Dates come from endoflife.date **[data]**. "Std/sec end" means the end of standard or security support. "EOL" means the end of the last support phase that endoflife.date lists, excluding paid extended support.

| Distro | glibc | Released | Std/sec end | EOL (excl. paid ext.) | Init | Pkg | Nexus tier | Control plane R1 | Remote R1 (SSH / connector) | Paperclip Runner |
|---|---|---|---|---|---|---|---|---|---|---|
| Ubuntu 26.04 LTS | 2.43 | 2026-04-23 | 2031-05-29 | 2031-05-29 | systemd | deb/apt | A | yes, **unverified** | SSH + connector, **unverified** | Runner |
| Ubuntu 24.04 LTS | 2.39 | 2024-04-25 | 2029-05-31 | 2029-05-31 | systemd | deb/apt | A (reference CI host) | yes, **unverified** | SSH + connector, **unverified** | Runner |
| Ubuntu 22.04 LTS | 2.35 | 2022-04-21 | 2027-06-01 | 2027-06-01 | systemd | deb/apt | A until 2027-06-01, then C | no (Runner fallback; see §6) | SSH + connector, **unverified** | **Legacy** |
| Debian 13 trixie | 2.41 | 2025-08-09 | 2028-08-09 | 2030-06-30 (LTS) | systemd | deb/apt | A | yes, **unverified** | SSH + connector, **unverified** | Runner (**[observed]**: this run host is Debian 13 x86_64) |
| Debian 12 bookworm | 2.36 | 2023-06-10 | 2026-07-11 (now in LTS) | 2028-06-30 | systemd | deb/apt | B (oldstable, in LTS) | no | SSH; connector after platform review | **Legacy** |
| RHEL / Rocky / Alma 10 | 2.39 (CentOS Stream 10) | 2025-05-20 / 06-11 / 05-27 | 2030-05-31 | 2035-05-31 | systemd | rpm/dnf | A | yes, **unverified** | SSH + connector, **unverified** | Runner |
| RHEL / Rocky / Alma 9 | 2.34 | 2022-05-18 | 2027-05-31 | 2032-05-31 | systemd | rpm/dnf | A | no (Runner fallback) | SSH + connector, **unverified** | **Legacy** |
| RHEL / Rocky / Alma 8 | 2.28 | 2019-05-07 | ended 2024-05-31 (maintenance) | 2029-05-31 | systemd | rpm/dnf | B (maintenance phase) | no | SSH; connector after review | **Legacy** |
| Amazon Linux 2023 | 2.34 **[doc: secondary]** | 2023-03-01 | 2027-06-30 | 2029-06-30 | systemd | rpm/dnf | B | no | SSH; connector after review | **Legacy** |
| Fedora 44 / 45 | 2.43 / unverified | 2026-04-28 / 2026-11-03 | 2027-06-02 / 2027-12-08 | same | systemd | rpm/dnf | B | no | SSH; connector after review | Runner (44) |
| SLES 16 / openSUSE Leap 16 | 2.40 **[doc: secondary]** | 2025-11-04 / 2025-10-01 | 2027-11-30 / 2027-10-31 | — | systemd | rpm/zypper | B | no | SSH; connector after review | Runner |
| openSUSE Leap 15.6 / SLES 15 SP7 | 2.38 (Leap 15.6) / unverified | 2024-06-12 / 2025-06-17 | Leap 15.6 EOL 2026-04-30 | SLES 15.7: 2031-07-31 | systemd | rpm/zypper | Leap 15.6: C; SLES 15 SP7: B | no | SSH | **Legacy** (2.38) |
| Arch (rolling) | 2.44 | rolling | rolling | rolling | systemd | pacman | B | no | SSH; connector after review | Runner |
| Alpine 3.21–3.24 | musl 1.2.5–1.2.6 | 3.24: 2026-06-09 | 3.24: 2028-06-01 | — | OpenRC | apk | B, SSH-only | no | SSH only; no connector until ADR (contract) | **Legacy** |
| Ubuntu 20.04, Debian 11, RHEL/CentOS 7, Amazon Linux 2, Leap ≤ 15.5 | ≤ 2.31 | — | ended (AL2: 2026-06-30; Debian 11 LTS: 2026-08-31) | — | systemd | — | C | no | SSH with an EOL warning; connector denied | Legacy |

Notes:
- Debian's "support" date (2028-08-09) is Debian Security. LTS volunteers continue to 2030-06-30 **[data]**. I recommend counting only Debian Security for Tier A.
- Contract Tier A says "RHEL/Rocky/Alma supported major releases". 8 is in Tier B because it is past full support and adds a third RPM CI target. **C2 ruling (EZF-12): accepted.** This narrows the contract wording, so the NX4-147 ADR must state it explicitly. Binding once that ADR records it.
- Ubuntu 22.04 keeps Tier A until its standard support ends, then drops to C. Ubuntu Pro ESM is a paid extension and does not count.

## 4. CPU and architecture matrix

| Target (Go `GOOS/GOARCH`) | Nexus artifacts | Baseline | Notes |
|---|---|---|---|
| `linux/amd64` | connector `.deb`/`.rpm`, control plane | Go default `GOAMD64=v1` **[doc]** | **RHEL 10 itself requires x86-64-v3** (Haswell or later) **[doc: Red Hat solution 7066628]**, so the RHEL 10 lab VM must expose v3. Keep Nexus binaries at v1 so they run on older CPUs under 9/8. |
| `linux/arm64` | connector `.deb`/`.rpm`, control plane | `GOARM64=v8.0` default **[doc]** | Paperclip: OpenCode and Pi stay Legacy on linux/arm64 **[doc + source]**. |
| `darwin/arm64` | `.pkg` (R1.1), control plane | Apple silicon M1 or later | Primary Mac target. |
| `darwin/amd64` | `.pkg` (R1.1), control plane | Intel on macOS 15/26 only | Has an end date (§1.1). Needs a real Intel Mac or CI runner. Availability is **unverified**. |
| `linux/arm` (32-bit), `linux/386`, other | none | — | Unsupported. SSH/SFTP only, if reachable (Tier C). Paperclip Runner: Legacy **[executed]**. |
| Windows | none | — | Out of Nexus scope. Paperclip Runner: Legacy **[executed]**. |

Kernel floors: Go ≥ 1.24 needs Linux ≥ 3.2 **[doc]**. Node 24 needs ≥ 4.18 and glibc ≥ 2.28 **[doc]**. Every Tier A/B distro ships newer kernels **[inferred]**. Node only matters where Node runs: the control plane and Paperclip. The connector is Go.

## 5. Init and service manager matrix

| Platform | Default init | R1 Nexus adapter | Paperclip host service **[doc: INSTALLING.md]** | Fallback |
|---|---|---|---|---|
| macOS 15/26/27 | launchd | Control plane: launchd (LaunchDaemon or LaunchAgent per privilege model). Connector: R1.1 | LaunchAgent | Foreground process |
| Linux Tier A/B (all above except Alpine) | systemd | systemd unit, sandboxed per `CONNECTOR_INSTALL_APPROVAL.md` | systemd **user** service | Foreground `paperclipai run` in containers or without user systemd |
| Alpine / OpenRC, runit, s6 | not systemd | none: SSH only | foreground | SSH only until a tested adapter and ADR exist |
| Containers (control plane) | none (PID 1 = app) | Compose deployment | foreground | — |

The `HostOSAdapter.probe` (ARCHITECTURE) must detect init by checking for a running PID 1. A binary merely being present is not enough: `systemctl` can exist inside a container that has no systemd **[inferred]**.

## 6. Paperclip Runner fallback cases (validated routing)

**What was executed:** `tools/research/paperclip-runner-routing-check.mjs` imports Paperclip's real `paperclipRunnerSupportsPlatform()` from the installed checkout and runs it. It asserts 114 cases: 12 Linux distros × {x64, arm64} × {claude, codex, opencode, pi}, plus 18 edge cases.

**Scope:** the "Routing (executed)" column covers only the `paperclipRunnerSupportsPlatform()` platform gate. It does not cover the adapter-availability, disable and override gates, or the `runnerTasks` / `managedCloudImage` path in `agentRunnerAvailability()`, which skips the platform gate and defaults to the Runner **[source]**. None of these change F1–F11 for Nexus's local and SSH hosts.

- Source under test: `packages/shared/src/agent-runner.ts`, sha256 `80d72059…bbbb820202`. This is **byte-identical to upstream `master`**: that file last changed in commit `fc6e1b0` (2026-11-07), checked against master `8b3348c` (2026-11-10). The package is `@paperclipai/shared` 0.3.1, MIT.
- Result: **114/114 PASS**, exit 0 (`evidence/ezf-12/runner-routing-check.txt`).
- Negative controls: scratch copies with the floor changed from 2.39 to 2.34 and to 2.40 give **84/114** and **102/114**, both exit 1 (`evidence/ezf-12/runner-routing-negative-control.txt`). So the check detects a lowered or raised floor. The exact `sed` and `PAPERCLIP_SHARED_AGENT_RUNNER` commands are in the evidence file and the script header.
- The real SSH platform probe command was also run on this host. It is read from `agent-runner-selection.ts` (sha256 `ffd07800…0180f1ee`). The script prints the command before running it, and it printed `Linux / x86_64 / glibc / glibc 2.41`.

| # | Case | Routing (executed) | Execution on real host |
|---|---|---|---|
| F1 | Linux x64/arm64, glibc ≥ 2.39 (Ubuntu 24.04/26.04, Debian 13, EL10, Fedora 44, SLES/Leap 16, Arch) | Runner | Debian 13 x86_64 only: this run uses the Claude ACP adapter with Claude Agent SDK `linux-x64` 0.3.286 **[observed]**. Others **unverified**. |
| F2 | Linux glibc < 2.39 (Ubuntu 22.04, Debian 12, EL8/EL9, AL2023, Leap 15.6) | **Legacy** | **unverified** |
| F3 | Linux arm64 with OpenCode or Pi, any glibc | **Legacy** | **unverified** |
| F4 | musl (Alpine) | **Legacy** | **unverified**. Note: a musl build of the Claude Agent SDK (`claude-agent-sdk-linux-x64-musl@0.3.286`) is present in the Paperclip install **[observed]**. This is relevant to the contract's "alternative legacy adapter" assessment, and is not proof that it works. |
| F5 | libc unknown (`getconf GNU_LIBC_VERSION` missing or failing) | **Legacy** | **unverified**. Minimal images without `getconf` land here even when they ship glibc. |
| F6 | Malformed glibc version string | **Legacy** | n/a (pure function) |
| F7 | 32-bit ARM, Windows | **Legacy** | n/a, out of scope |
| F8 | macOS arm64 / x64, **any version** | Runner | **unverified**. No version gate exists. Node ≥ 24.11 gives a de facto macOS ≥ 13.5 floor. |
| F9 | Claude agent on a **Mac reached over SSH** | Runner is *supported*, but the **default is Legacy** (`agent-runner-selection.ts`, `automatic = supported && !(claude_local && ssh && darwin)`) **[source]**, matching the Runner docs **[doc]** | **unverified**. Read from source, not executed: the module needs the Paperclip DB and server context. |
| F10 | Kubernetes execution mode / Cursor Cloud | special-cased, Legacy or none **[source]** | not relevant to Nexus R1 |
| F11 | Linux glibc with **no version** (`libc=glibc`, version undefined) | Runner (pins current behaviour; `supportsLinuxLibc()` returns true) | n/a (pure function). The shipped SSH probe prints the version on the same branch as `glibc`, so this needs truncated probe output or another caller **[inferred]**. |

**What this means for Nexus:**
- R1 Paperclip agent hosts (dev and CI) must be glibc ≥ 2.39: Ubuntu 24.04+ or Debian 13 (**C2 ruling, EZF-12**; binding once the NX4-147 ADR records it). Ubuntu 22.04 or EL9 build hosts would silently put agents on the Legacy runner.
- Nexus product hosts are not constrained by the Runner. The "ACP Claude agent session recovery" row in the compatibility matrix must be tested **per runner type** on the F2 distros, because Runner and Legacy are different execution paths.
- Version pins reported by the Runner docs (Codex 0.160.0, OpenCode 1.18.34, Claude Agent SDK 0.3.286, Copilot CLI 1.0.88) **[doc]** must go into the license and dependency ledger before any Nexus test depends on them.

## 7. Lab plan to turn PENDING into evidence (not executed)

All in local containers or owner-provided hardware. No paid cloud without board approval.

| Lab item | How | Needs |
|---|---|---|
| F1/F2/F4/F5 Legacy and Runner execution | A disposable Paperclip instance per distro container (`ubuntu:22.04`, `ubuntu:24.04`, `debian:12`, `rockylinux:9`, `rockylinux:10`, `alpine:3.24`, plus one without `getconf`). Run one trivial Codex and one Claude task each, and record the runner chosen and the outcome. | A docker or podman host. **The run host has neither, and package installs are forbidden.** This needs board-provided test infrastructure. |
| arm64 Linux | The same images on an arm64 host (for example a Raspberry Pi 5 or an arm64 workstation). qemu-user is acceptable only for routing checks, not for performance or service tests. | Owner hardware |
| macOS 27/26/15 Apple silicon | One Apple silicon Mac mini with test user accounts. Run SSH/SFTP, tmux reattach, sleep/wake, and a launchd control-plane smoke test. | Owner hardware, human approval |
| macOS Intel (15/26) | One Intel Mac with T2 (2019/2020) or a CI runner. Hosted Intel macOS CI availability is **unverified**. | Board decision. Per the contract, missing hardware blocks the GA claim for darwin/amd64. |
| RHEL 10 x86-64-v3 | The VM CPU model must expose v3 (§4). | — |

## 8. Proposed changes for review (not applied; the spec kit is read-only reference)

1. `compat/supported-platforms.yaml`
   - `control_plane.macos`: replace `release_tier: current-and-previous-two-supported-major` with explicit `versions: ['27', '26', '15']` and `amd64_versions: ['26', '15']`. Add `amd64_sunset: tied-to-macos-26-security-updates`.
   - `control_plane.linux.distributions`: pin `ubuntu-lts: ['24.04', '26.04', '22.04 until 2027-06-01']`, `debian-stable: ['13']` and `rhel-compatible: ['9', '10']`.
   - `paperclip_runtime`: add `macos_min_effective: '13.5 (via Node 24)'`, `claude_over_ssh_to_macos_default: legacy`, and `legacy_hosts_tier_a: [ubuntu-22.04, rhel-9]`.
2. `compat/COMPATIBILITY_TEST_MATRIX.md`: add columns for Ubuntu arm64, RHEL-compatible arm64 and Alpine (SSH only). Split the "ACP Claude agent session recovery" row by Runner and Legacy.
3. `CROSS_PLATFORM_PRODUCT_CONTRACT.md` Tier A wording "Apple Silicon and Intel hardware where OS vendor supports that combination" is correct. Add a dated note that macOS 27+ is Apple-silicon-only.
4. Record decision D5 (I-3) in an ADR via NX4-147 ([EZF-16](/EZF/issues/EZF-16)). C2 accepted §1.7 on EZF-12.
5. The same ADR must record the other C2 rulings from EZF-12 (§1.8): RHEL 8 in Tier B (an explicit narrowing of the contract's Tier A wording), the darwin/amd64 sunset tied to macOS 26 security updates with no darwin/amd64 GA claim without Intel hardware or CI, and glibc ≥ 2.39 for Paperclip dev/CI agent hosts.

Every recommendation here is **proposed**. C2 has accepted items 1–5 as working positions, but none changes a support claim until the ADR records it and CI evidence exists.

## 9. Sources (all fetched 2026-11-10 unless noted)

| Ref | URL | Pin / note |
|---|---|---|
| Paperclip Runner supported platforms | https://docs.paperclip.ing/reference/adapters/paperclip-runner/ | No page date shown. Quoted: "Linux x64 or ARM64 with GNU libc `2.39` or newer", "A Mac reached over SSH defaults to Legacy". |
| Paperclip host install | https://github.com/paperclipai/paperclip/blob/master/doc/INSTALLING.md | Last changed at commit `2991a59b17e33c8d0476e5aa23553332d79e0f72` (2026-09-09). Node ≥ 24.11, systemd user service / LaunchAgent. |
| Paperclip Runner gate source | https://github.com/paperclipai/paperclip/blob/master/packages/shared/src/agent-runner.ts | Last changed at commit `fc6e1b0346a33a27722159025718fe765251ae1b` (2026-11-07). Local copy sha256 `80d720592871d8a7abde88f543c9ededffc8cf562c7c07ceba45bebbbb820202` equals master `8b3348c6bade125ed2f79014ac661cfc79e48176`. MIT. |
| Paperclip runner selection | local `/app/server/src/services/agent-runner-selection.ts` (`@paperclipai/server` 0.3.1) | sha256 `ffd0780061168c5df134ccc003907c5bb939d6186ecaaef00ab8f5000180f1ee`. Not compared with upstream. |
| Apple security releases | https://support.apple.com/en-us/100100 | 27.2.1, 26.7.3 and 15.8.3 on 2026-11-09. Sonoma last 14.8.9 on 2026-08-06. |
| macOS 27 compatible computers | https://support.apple.com/127255 | Apple silicon models only. |
| macOS 26 last Intel release (secondary) | https://sixcolors.com/post/2025/06/macos-tahoe-is-the-last-release-to-support-intel/ ; https://www.tomshardware.com/software/macos/macos-tahoe-is-the-last-release-for-intel-macs-apple-silicon-exclusivity-will-mark-end-of-hackintoshes | Press reports of WWDC 2025. The exact Tahoe Intel model list is **unverified** against Apple's page (the fetcher gave a self-contradictory answer). |
| Lifecycle data | https://endoflife.date/api/{macos,ubuntu,debian,rhel,rocky-linux,almalinux,amazon-linux,fedora,sles,opensuse,alpine-linux}.json | Machine-readable data. Community-maintained. |
| glibc per distro | https://repology.org/api/v1/project/glibc ; https://packages.ubuntu.com/{jammy,noble,resolute}/libc6 ; https://sources.debian.org/api/src/glibc/ | Ubuntu 2.35/2.39/2.43, Debian 2.36/2.41, EL 2.28/2.34/2.39 (CentOS Stream 10). |
| Amazon Linux 2023, SLES 16 / Leap 16 glibc (secondary) | https://docs.aws.amazon.com/linux/al2023/ug/core-glibc.html ; https://www.suse.com/support/update/announcement/2026/suse-su-202620198-1 | Search-result summaries. Confirm on the pages before relying on them. |
| musl in Alpine | https://repology.org/api/v1/project/musl | Alpine 3.24: musl 1.2.6. |
| Go minimum requirements | https://go.dev/wiki/MinimumRequirements | Go 1.27: macOS ≥ 13. Go 1.25/1.26: macOS ≥ 12. Linux ≥ 3.2. GOAMD64 v1, GOARM64 v8.0. |
| Go releases | https://go.dev/doc/devel/release | 1.27.0 on 2026-08-19 (latest 1.27.3), 1.26.10 on 2026-10-19. |
| Node.js 24 platform list | https://github.com/nodejs/node/blob/v24.x/BUILDING.md | Commit `d319fa7de451fa319f750f238c254f7f3a964a01` (2026-09-25). macOS ≥ 13.5, Linux glibc ≥ 2.28, kernel ≥ 4.18. |
| RHEL 10 x86-64-v3 | https://access.redhat.com/solutions/7066628 ; https://developers.redhat.com/articles/2024/01/02/exploring-x86-64-v3-red-hat-enterprise-linux-10 | The solution title states that v3 is required by RHEL 10. |

## 10. OS/arch compatibility declaration for this deliverable

This is a research document plus one Node script.
- The script runs where Node ≥ 22.18 can import TypeScript (macOS or Linux, any arch) and a Paperclip checkout exists.
- It executed only on Linux x86_64 (Debian 13, glibc 2.41, Node v24.22.2).
- SSH-only fallback: not applicable.
- No production host, credential, package install or network write was involved.
