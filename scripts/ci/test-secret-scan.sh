#!/usr/bin/env bash
# Self-test for scripts/ci/secret-scan.sh (EZF-28). Needs gitleaks on PATH.
# Builds throwaway git repos and asserts that a secret is still found when a
# .gitattributes in the scanned range marks its file non-diffable.
#
# The fixture key is derived at runtime from a fixed seed, so it is
# deterministic but no secret-like string exists in this repository. It never
# leaves the temporary directory, and secret-scan.sh runs gitleaks --redact.
set -euo pipefail

SCAN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/secret-scan.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fails=0

# AWS access key ID shape: 4-char prefix + 16 chars from [A-Z2-7].
key_id="AK""IA$(printf 'ezf-28-fixture' | sha256sum | cut -c1-16 | tr '0-9a-f' 'A-P')"

git_t() { git -C "$1" -c user.name=t -c user.email=t@example.invalid "${@:2}"; }

# new_repo <name>: repo with one base commit.
new_repo() {
  local d="$WORK/$1"
  mkdir -p "$d/src"
  git -C "$d" init -q
  echo "# x" > "$d/README.md"
  git_t "$d" add -A
  git_t "$d" commit -q -m base
  echo "$d"
}

commit_head() {
  git_t "$1" add -A
  git_t "$1" commit -q -m head
}

# expect <name> <repo> <expected-exit>: scans HEAD~1..HEAD.
expect() {
  local name="$1" repo="$2" want_rc="$3" out rc
  set +e
  out="$(cd "$repo" && bash "$SCAN" HEAD~1..HEAD 2>&1)"
  rc=$?
  set -e
  if [[ "$rc" -eq "$want_rc" ]]; then
    echo "PASS $name (exit $rc)"
  else
    echo "FAIL $name: want exit $want_rc, got exit $rc:"
    while IFS= read -r line; do echo "    $line"; done <<<"$out"
    fails=$((fails + 1))
  fi
}

# 1. Clean change: no finding.
r="$(new_repo clean)"
echo "hello" > "$r/src/app.txt"
commit_head "$r"
expect "clean-change-passes" "$r" 0

# 2. Baseline: a plain-text secret is found.
r="$(new_repo baseline)"
echo "aws_key_id = $key_id" > "$r/src/app.txt"
commit_head "$r"
expect "plain-secret-found" "$r" 1

# 3-5. .gitattributes added in the same range marks the file non-diffable.
for attr in "-diff" "binary"; do
  r="$(new_repo "attr$attr")"
  echo "*.txt $attr" > "$r/.gitattributes"
  echo "aws_key_id = $key_id" > "$r/src/app.txt"
  commit_head "$r"
  expect "secret-found-despite-gitattributes-$attr" "$r" 1
done
r="$(new_repo attr-nested)"
echo "* -diff" > "$r/src/.gitattributes"
echo "aws_key_id = $key_id" > "$r/src/app.txt"
commit_head "$r"
expect "secret-found-despite-nested-gitattributes" "$r" 1

# 6. Option injection through the range is refused.
r="$(new_repo bad-range)"
set +e
(cd "$r" && bash "$SCAN" "--all" >/dev/null 2>&1)
rc=$?
set -e
if [[ "$rc" -eq 2 ]]; then echo "PASS option-as-range-refused (exit 2)"; else echo "FAIL option-as-range-refused: got exit $rc"; fails=$((fails + 1)); fi

if [[ "$fails" -ne 0 ]]; then
  echo "$fails secret-scan self-test(s) failed"
  exit 1
fi
echo "all secret-scan self-tests passed"
