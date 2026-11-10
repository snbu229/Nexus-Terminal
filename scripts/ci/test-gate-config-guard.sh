#!/usr/bin/env bash
# Self-test for scripts/ci/gate-config-guard.sh (EZF-28). Builds throwaway git
# repos with a base and a head commit and asserts the guard's exit code and
# warnings for each case. No secret-like strings are used.
set -euo pipefail

GUARD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/gate-config-guard.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fails=0
MARKER="gitleaks"":allow"

git_t() { git -C "$1" -c user.name=t -c user.email=t@example.invalid "${@:2}"; }

# new_repo <name>: repo with one base commit (README.md, src/app.txt).
new_repo() {
  local d="$WORK/$1"
  mkdir -p "$d/src"
  git -C "$d" init -q
  echo "# x" > "$d/README.md"
  echo "a" > "$d/src/app.txt"
  git_t "$d" add -A
  git_t "$d" commit -q -m base
  echo "$d"
}

commit_head() {
  git_t "$1" add -A
  git_t "$1" commit -q --allow-empty -m head
}

# expect <name> <repo> <base> <expected-exit> <want-substring> [<must-not-contain>]
expect() {
  local name="$1" repo="$2" base="$3" want_rc="$4" want_out="$5" not_out="${6:-}" out rc
  set +e
  out="$(cd "$repo" && bash "$GUARD" "$base" HEAD 2>&1)"
  rc=$?
  set -e
  if [[ "$rc" -eq "$want_rc" && "$out" == *"$want_out"* && ( -z "$not_out" || "$out" != *"$not_out"* ) ]]; then
    echo "PASS $name (exit $rc)"
  else
    local without=""
    if [[ -n "$not_out" ]]; then without=" without '$not_out'"; fi
    echo "FAIL $name: want exit $want_rc and '$want_out'$without, got exit $rc:"
    while IFS= read -r line; do echo "    $line"; done <<<"$out"
    fails=$((fails + 1))
  fi
}

# 1. Ordinary change: no warning.
r="$(new_repo plain)"
echo "b" >> "$r/src/app.txt"
commit_head "$r"
expect "ordinary-change-no-warning" "$r" HEAD~1 0 "No gitleaks suppression" "::warning"

# 2. Root .gitleaks.toml added.
r="$(new_repo gl-toml)"
printf '[allowlist]\npaths = [".*"]\n' > "$r/.gitleaks.toml"
commit_head "$r"
expect "gitleaks-toml-added-warns" "$r" HEAD~1 0 "::warning file=.gitleaks.toml,title=gitleaks config changed"

# 3. .gitleaksignore in a subdirectory.
r="$(new_repo gl-ignore)"
echo "deadbeef:src/app.txt:generic-api-key:1" > "$r/src/.gitleaksignore"
commit_head "$r"
expect "nested-gitleaksignore-warns" "$r" HEAD~1 0 "::warning file=src/.gitleaksignore,title=gitleaks config changed"

# 4. Inline allow marker added on line 2 of an existing file.
r="$(new_repo gl-inline)"
echo "token = placeholder # $MARKER" >> "$r/src/app.txt"
commit_head "$r"
expect "inline-allow-added-warns" "$r" HEAD~1 0 "::warning file=src/app.txt,line=2,title=inline gitleaks allow added"

# 5. Inline allow marker removed: not a warning.
r="$(new_repo gl-inline-removed)"
echo "x # $MARKER" > "$r/src/app.txt"
commit_head "$r"
echo "x" > "$r/src/app.txt"
commit_head "$r"
expect "inline-allow-removed-no-warning" "$r" HEAD~1 0 "No gitleaks suppression" "::warning"

# 6. Other merge-gate files: workflow, Makefile, lychee, osv, markdownlint.
r="$(new_repo gate-files)"
mkdir -p "$r/.github/workflows"
echo "name: other" > "$r/.github/workflows/other.yml"
printf 'ci:\n\t@true\n' > "$r/Makefile"
touch "$r/lychee.toml" "$r/.lycheeignore" "$r/osv-scanner.toml" "$r/src/.markdownlint.yaml"
commit_head "$r"
expect "new-workflow-warns" "$r" HEAD~1 0 "::warning file=.github/workflows/other.yml,title=merge-gate file changed"
expect "makefile-warns" "$r" HEAD~1 0 "::warning file=Makefile,title=merge-gate file changed"
expect "scanner-configs-warn" "$r" HEAD~1 0 "6 other merge-gate file(s) changed" ""
expect "nested-markdownlint-warns" "$r" HEAD~1 0 "::warning file=src/.markdownlint.yaml"

# 7. Range is from the merge-base: a change only on base's side is ignored.
r="$(new_repo merge-base)"
git_t "$r" checkout -q -b feature
echo "c" >> "$r/src/app.txt"
commit_head "$r"
git_t "$r" checkout -q -
printf '[allowlist]\n' > "$r/.gitleaks.toml"
commit_head "$r"
base="$(git -C "$r" rev-parse HEAD)"
git_t "$r" checkout -q feature
expect "base-side-change-ignored" "$r" "$base" 0 "No gitleaks suppression" "::warning"

# 8. New ref (all-zero base): compares against the empty tree.
r="$(new_repo new-ref)"
touch "$r/.gitleaksignore"
commit_head "$r"
expect "all-zero-base-scans-everything" "$r" 0000000000000000000000000000000000000000 0 "::warning file=.gitleaksignore"

# 9. Unknown base: fails closed.
r="$(new_repo bad-base)"
expect "unknown-base-fails" "$r" 1111111111111111111111111111111111111111 128 ""

# 10. .gitattributes (root and nested) is a merge-gate file: it can mark files
#     binary/non-diffable and hide them from diff-based scanners.
r="$(new_repo gitattributes)"
echo "*.txt -diff" > "$r/.gitattributes"
echo "*.txt binary" > "$r/src/.gitattributes"
commit_head "$r"
expect "gitattributes-warns" "$r" HEAD~1 0 "::warning file=.gitattributes,title=merge-gate file changed"
expect "nested-gitattributes-warns" "$r" HEAD~1 0 "::warning file=src/.gitattributes,title=merge-gate file changed"

# 11. An added line starting with "++" (shown as "+++ ..." in the patch) is
#     content, not a file header: a later marker in the same hunk still warns.
r="$(new_repo plusplus)"
printf '++ counter\nx # %s\n' "$MARKER" >> "$r/src/app.txt"
commit_head "$r"
expect "plusplus-line-then-allow-warns" "$r" HEAD~1 0 "::warning file=src/app.txt,line=3,title=inline gitleaks allow added"

# 12. Non-ASCII path (quoted by default core.quotePath) is parsed.
r="$(new_repo non-ascii)"
echo "x # $MARKER" > "$r/src/caf$(printf '\303\251').txt"
commit_head "$r"
expect "non-ascii-path-allow-warns" "$r" HEAD~1 0 "::warning file=src/caf$(printf '\303\251').txt,line=1,title=inline gitleaks allow added"

# 13. Path that git still C-quotes (backslash in name): warns with git's form.
r="$(new_repo quoted-path)"
echo "x # $MARKER" > "$r/src/a\\b.txt"
commit_head "$r"
expect "c-quoted-path-allow-warns" "$r" HEAD~1 0 'file=src/a\\b.txt,line=1,title=inline gitleaks allow added'

# 14. Marker in a file .gitattributes marks binary, and in a file with a NUL
#     byte: the patch is read with --text, so both warn.
r="$(new_repo binary-marked)"
echo "*.dat -diff" > "$r/.gitattributes"
git_t "$r" add .gitattributes
git_t "$r" commit -q -m attrs
echo "x # $MARKER" > "$r/src/a.dat"
printf 'bin\000\nx # %s\n' "$MARKER" > "$r/src/b.bin"
commit_head "$r"
expect "allow-in-non-diffable-file-warns" "$r" HEAD~1 0 "::warning file=src/a.dat,line=1,title=inline gitleaks allow added"
expect "allow-in-nul-byte-file-warns" "$r" HEAD~1 0 "::warning file=src/b.bin,line=2,title=inline gitleaks allow added"

if [[ "$fails" -ne 0 ]]; then
  echo "$fails gate-config-guard self-test(s) failed"
  exit 1
fi
echo "all gate-config-guard self-tests passed"
