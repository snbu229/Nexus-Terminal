#!/usr/bin/env bash
# Self-test for scripts/ci/code-gate.sh (EZF-28). Builds throwaway git repos
# and asserts the gate's exit code and message for each case.
set -euo pipefail

GATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/code-gate.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fails=0

new_repo() {
  local d="$WORK/$1"
  mkdir -p "$d"
  git -C "$d" init -q
  echo "$d"
}

commit_all() {
  git -C "$1" add -A
  git -C "$1" -c user.name=t -c user.email=t@example.invalid commit -q --allow-empty -m t
}

# expect <name> <repo> <expected-exit> <expected-output-substring>
expect() {
  local name="$1" repo="$2" want_rc="$3" want_out="$4" out rc
  set +e
  out="$(cd "$repo" && bash "$GATE" 2>&1)"
  rc=$?
  set -e
  if [[ "$rc" -eq "$want_rc" && "$out" == *"$want_out"* ]]; then
    echo "PASS $name (exit $rc)"
  else
    echo "FAIL $name: want exit $want_rc and '$want_out', got exit $rc:"
    while IFS= read -r line; do echo "    $line"; done <<<"$out"
    fails=$((fails + 1))
  fi
}

# 1. Docs-only repo: skip with an explicit notice.
r="$(new_repo empty)"
echo "# x" > "$r/README.md"
commit_all "$r"
expect "no-source-skips" "$r" 0 "::notice"

# 2. Only placeholders/docs under code dirs: still a skip.
r="$(new_repo placeholders)"
mkdir -p "$r/apps/web" "$r/services/api"
touch "$r/apps/web/.gitkeep"
echo "# api" > "$r/services/api/README.md"
commit_all "$r"
expect "placeholders-skip" "$r" 0 "::notice"

# 3. Source present, no Makefile: must fail.
r="$(new_repo src-no-makefile)"
mkdir -p "$r/packages/core"
echo "export const x = 1;" > "$r/packages/core/index.ts"
commit_all "$r"
expect "source-without-makefile-fails" "$r" 1 "packages/core/index.ts"

# 5. Untracked source counts too (a gitignored dir must not hide code).
r="$(new_repo untracked-src)"
commit_all "$r"
mkdir -p "$r/apps/cli"
echo "fn main() {}" > "$r/apps/cli/main.rs"
expect "untracked-source-fails" "$r" 1 "apps/cli/main.rs"

# Cases below need GNU make (present on ubuntu-latest). Only an explicit
# opt-out may skip them, so CI can never pass these silently.
if ! command -v make >/dev/null 2>&1; then
  if [[ "${ALLOW_NO_MAKE:-}" == "1" ]]; then
    echo "SKIP make-dependent cases 4 and 6-9: make not installed (ALLOW_NO_MAKE=1)"
    if [[ "$fails" -ne 0 ]]; then echo "$fails code-gate self-test(s) failed"; exit 1; fi
    echo "code-gate self-tests passed (make-dependent cases skipped)"
    exit 0
  fi
  echo "FAIL: make is required for code-gate self-tests"
  exit 1
fi

# 4. Source present, Makefile without a ci target: must fail.
r="$(new_repo src-no-ci-target)"
mkdir -p "$r/services/agent"
echo "package main" > "$r/services/agent/main.go"
printf 'build:\n\t@echo build\n' > "$r/Makefile"
commit_all "$r"
expect "source-without-ci-target-fails" "$r" 1 "no 'ci' target"

# 6. Source + ci target that passes: gate passes and runs it.
r="$(new_repo ci-pass)"
mkdir -p "$r/apps/web"
echo "x" > "$r/apps/web/main.js"
printf 'ci:\n\t@echo MAKE_CI_RAN\n' > "$r/Makefile"
commit_all "$r"
expect "ci-target-runs" "$r" 0 "MAKE_CI_RAN"

# 7. Source + ci target that fails: gate propagates the failure.
r="$(new_repo ci-fail)"
mkdir -p "$r/apps/web"
echo "x" > "$r/apps/web/main.js"
printf 'ci:\n\t@echo MAKE_CI_FAILED; exit 3\n' > "$r/Makefile"
commit_all "$r"
expect "ci-target-failure-propagates" "$r" 2 "MAKE_CI_FAILED"

# 8. ci target with no source yet: still runs (never silently skipped).
r="$(new_repo ci-no-src)"
printf 'ci:\n\t@echo MAKE_CI_RAN\n' > "$r/Makefile"
commit_all "$r"
expect "ci-target-without-source-runs" "$r" 0 "MAKE_CI_RAN"

# 9. Broken Makefile is an error, not "no ci target", even with no source.
r="$(new_repo broken-makefile)"
printf 'ci:\n  echo spaces-not-tab\n' > "$r/Makefile"
commit_all "$r"
expect "broken-makefile-fails" "$r" 1 "other than a missing target"

if [[ "$fails" -ne 0 ]]; then
  echo "$fails code-gate self-test(s) failed"
  exit 1
fi
echo "all code-gate self-tests passed"
