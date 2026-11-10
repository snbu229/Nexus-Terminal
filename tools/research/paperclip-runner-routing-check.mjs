#!/usr/bin/env node
// EZF-12 / NX3-103: executes Paperclip's own Runner platform gate against the
// Nexus distro matrix. Nothing is copied from Paperclip: the module is imported
// from an installed Paperclip checkout (MIT) and its hash is printed so the run
// is tied to an exact source revision.
//
// Usage (Node >= 22.18 / 24 for TypeScript type stripping):
//   PAPERCLIP_SHARED_AGENT_RUNNER=/app/packages/shared/src/agent-runner.ts \
//   PAPERCLIP_RUNNER_SELECTION=/app/server/src/services/agent-runner-selection.ts \
//     node tools/research/paperclip-runner-routing-check.mjs
//
// Exit code 0 only when every case matches the expected routing decision.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const modulePath = process.env.PAPERCLIP_SHARED_AGENT_RUNNER ?? "/app/packages/shared/src/agent-runner.ts";
const selectionPath = process.env.PAPERCLIP_RUNNER_SELECTION ?? "/app/server/src/services/agent-runner-selection.ts";
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const { paperclipRunnerSupportsPlatform, PAPERCLIP_RUNNER_MINIMUM_GLIBC_VERSION } = await import(modulePath);

// glibc versions: Repology / packages.ubuntu.com / sources.debian.org, fetched 2026-11-10
// (see docs/research/platform-support-matrix.md §8). RUNNER = Paperclip Runner, LEGACY = Legacy runner.
const linuxDistros = [
  ["Ubuntu 22.04 LTS", "2.35", "LEGACY"],
  ["Ubuntu 24.04 LTS", "2.39", "RUNNER"],
  ["Ubuntu 26.04 LTS", "2.43", "RUNNER"],
  ["Debian 12 bookworm", "2.36", "LEGACY"],
  ["Debian 13 trixie", "2.41", "RUNNER"],
  ["RHEL/Rocky/Alma 8", "2.28", "LEGACY"],
  ["RHEL/Rocky/Alma 9", "2.34", "LEGACY"],
  ["RHEL/Rocky/Alma 10 (CentOS Stream 10)", "2.39", "RUNNER"],
  ["Amazon Linux 2023", "2.34", "LEGACY"],
  ["Fedora 44", "2.43", "RUNNER"],
  ["openSUSE Leap 15.6", "2.38", "LEGACY"],
  ["SLES 16 / openSUSE Leap 16", "2.40", "RUNNER"],
];

const cases = [];
for (const [name, glibc, expected] of linuxDistros) {
  for (const arch of ["x64", "arm64"]) {
    for (const harness of ["claude_local", "codex_local", "opencode_local", "pi_local"]) {
      // OpenCode and Pi stay Legacy on Linux arm64 regardless of libc (Runner docs).
      const exp = ["opencode_local", "pi_local"].includes(harness) && arch === "arm64" ? "LEGACY" : expected;
      cases.push({ name: `${name} linux/${arch} glibc ${glibc}`, harness, args: ["linux", arch, "glibc", glibc], expected: exp });
    }
  }
}
for (const harness of ["claude_local", "codex_local"]) {
  cases.push(
    { name: "Alpine (musl) linux/x64", harness, args: ["linux", "x64", "musl", undefined], expected: "LEGACY" },
    { name: "Alpine (musl) linux/arm64", harness, args: ["linux", "arm64", "musl", undefined], expected: "LEGACY" },
    { name: "Linux libc unknown (getconf missing)", harness, args: ["linux", "x64", "unknown", undefined], expected: "LEGACY" },
    { name: "Linux glibc malformed version string", harness, args: ["linux", "x64", "glibc", "2.39-custom"], expected: "LEGACY" },
    { name: "Linux 32-bit ARM (armv7l)", harness, args: ["linux", "armv7l", "glibc", "2.41"], expected: "LEGACY" },
    { name: "macOS Apple Silicon (darwin/arm64)", harness, args: ["darwin", "arm64"], expected: "RUNNER" },
    { name: "macOS Intel (darwin/x64)", harness, args: ["darwin", "x64"], expected: "RUNNER" },
    { name: "Windows x64 (out of Nexus scope)", harness, args: ["win32", "x64"], expected: "LEGACY" },
  );
}

let failures = 0;
console.log(`module: ${modulePath}\nsha256: ${sha256(modulePath)}`);
console.log(`PAPERCLIP_RUNNER_MINIMUM_GLIBC_VERSION=${PAPERCLIP_RUNNER_MINIMUM_GLIBC_VERSION}\n`);
for (const c of cases) {
  const actual = paperclipRunnerSupportsPlatform(c.harness, ...c.args) ? "RUNNER" : "LEGACY";
  const ok = actual === c.expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.harness.padEnd(15)} ${c.name.padEnd(58)} expected=${c.expected} actual=${actual}`);
}

// Run Paperclip's real SSH platform probe on this machine (read-only commands:
// uname, getconf, ldd --version). The command string is read from the installed
// source, not copied here.
try {
  const src = readFileSync(selectionPath, "utf8");
  const m = src.match(/AGENT_RUNNER_SSH_PLATFORM_COMMAND = ("(?:[^"\\]|\\.)*")/);
  if (!m) throw new Error("probe command not found");
  const probe = JSON.parse(m[1]);
  console.log(`\nselection source sha256: ${sha256(selectionPath)}`);
  console.log(`local probe output (this host):\n${execFileSync("/bin/sh", ["-c", probe], { encoding: "utf8" }).trim()}`);
} catch (err) {
  console.log(`\nlocal probe skipped: ${err.message}`);
}

console.log(`\n${cases.length - failures}/${cases.length} cases match expected routing`);
process.exit(failures ? 1 : 0);
