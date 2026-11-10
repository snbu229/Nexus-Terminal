#!/usr/bin/env bash
# Merge-gate config guard (EZF-28). Run from the repository root.
#
#   usage: scripts/ci/gate-config-guard.sh <base> <head>
#
# A pull_request run uses the PR's own files, so a PR can weaken the gate it
# is checked by (for example an allow-all .gitleaks.toml keeps gitleaks and
# `ci-required` green). This script cannot prevent that; it makes it visible.
# For the change range merge-base(<base>, <head>)..<head> it emits a
# ::warning annotation and a step-summary entry for:
#
#   - any change to a gitleaks config or ignore file (.gitleaks.toml,
#     .gitleaksignore, at any depth), and any added inline gitleaks allow
#     comment: these turn secret findings off;
#   - any change to another file that defines the merge gate (see
#     is_gate_file), including .gitattributes at any depth, which can mark
#     files as binary/non-diffable. Such PRs are `human-approval-required`
#     under docs/process/git-workflow.md section 2.
#
# The patch is read with --text (and fixed a/ b/ prefixes), so .gitattributes
# cannot hide added lines from the parser, and an added marker line whose
# path cannot be parsed still warns.
#
# It only warns: review is the control. It exits non-zero only if the range
# cannot be computed, so a broken guard fails closed. An empty or all-zero
# <base> (a new ref) means "compare against the empty tree".
set -euo pipefail

if [[ $# -ne 2 || -z "$2" ]]; then
  echo "usage: $0 <base> <head>" >&2
  exit 2
fi
base="$1"
head="$2"

# Split so this script does not itself contain the marker it looks for.
ALLOW_MARKER="gitleaks"":allow"

is_gitleaks_file() {
  case "$1" in
    .gitleaks.toml | */.gitleaks.toml | .gitleaksignore | */.gitleaksignore) return 0 ;;
  esac
  return 1
}

# Files that define or configure the merge gate. Keep in sync with
# docs/process/git-workflow.md section 2.
is_gate_file() {
  case "$1" in
    .github/* | scripts/ci/* | docs/process/git-workflow.md) return 0 ;;
    .gitattributes | */.gitattributes) return 0 ;;
    Makefile | */Makefile | makefile | */makefile | GNUmakefile | */GNUmakefile | *.mk) return 0 ;;
    lychee.toml | */lychee.toml | .lycheeignore | */.lycheeignore) return 0 ;;
    osv-scanner.toml | */osv-scanner.toml) return 0 ;;
    .markdownlint* | */.markdownlint*) return 0 ;;
  esac
  return 1
}

# Escape a value for a workflow-command property (file=..., line=...).
prop() {
  local v="$1"
  v="${v//%/%25}"
  v="${v//$'\r'/%0D}"
  v="${v//$'\n'/%0A}"
  v="${v//:/%3A}"
  v="${v//,/%2C}"
  printf '%s' "$v"
}

summary() {
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"
  fi
}

if [[ -z "$base" || "$base" =~ ^0+$ ]]; then
  from="$(git hash-object -t tree /dev/null)"
else
  from="$(git merge-base "$base" "$head")"
fi
echo "Gate-config guard: comparing ${from}..${head}"

gitleaks_files=()
gate_files=()
while IFS= read -r -d '' path; do
  if is_gitleaks_file "$path"; then
    gitleaks_files+=("$path")
  elif is_gate_file "$path"; then
    gate_files+=("$path")
  fi
done < <(git diff --no-renames --name-only -z "$from" "$head" --)

# Added lines carrying the inline allow marker, as "path:line". "+++ " is a
# file header only between "diff --git" and the first "@@"; inside a hunk it
# is an added line whose content starts with "++".
UNPARSED="<unparsed path>"
allow_hits=()
file="" line=0 in_hunk=0
while IFS= read -r l; do
  case "$l" in
    "diff --git "*)
      file="" in_hunk=0
      continue
      ;;
    "@@ "*)
      in_hunk=1
      line="${l#*+}"
      line="${line%%[, ]*}"
      continue
      ;;
  esac
  if [[ "$in_hunk" -eq 0 ]]; then
    case "$l" in
      "+++ b/"*) file="${l#+++ b/}" ;;
      # Still C-quoted (control characters, '"' or '\' in the name): keep
      # git's escaped form, which is enough to find the file.
      '+++ "b/'*)
        file="${l#+++ \"b/}"
        file="${file%\"}"
        ;;
      "+++ "*) file="" ;;
    esac
    continue
  fi
  case "$l" in
    "+"*)
      if [[ "$l" == *"$ALLOW_MARKER"* ]]; then
        allow_hits+=("${file:-$UNPARSED}:${line}")
      fi
      line=$((line + 1))
      ;;
    " "*) line=$((line + 1)) ;;
  esac
done < <(git -c core.quotePath=false diff --no-renames --no-color --no-ext-diff --no-textconv --text \
  --src-prefix=a/ --dst-prefix=b/ -U0 "$from" "$head" --)

# ${a[@]+"${a[@]}"}: empty arrays under set -u abort macOS's bash 3.2.
warned=0
if [[ ${#gitleaks_files[@]} -gt 0 || ${#allow_hits[@]} -gt 0 ]]; then
  warned=1
  summary "### Secret-scan suppression changed (human-approval-required)"
  for f in ${gitleaks_files[@]+"${gitleaks_files[@]}"}; do
    echo "::warning file=$(prop "$f"),title=gitleaks config changed::${f} changes what gitleaks reports. It can turn secret findings off while ci-required stays green. Human approval required."
    summary "- gitleaks config changed: \`${f}\`"
  done
  for h in ${allow_hits[@]+"${allow_hits[@]}"}; do
    echo "::warning file=$(prop "${h%:*}"),line=${h##*:},title=inline gitleaks allow added::${h} adds an inline gitleaks allow comment, which suppresses secret findings on that line. Human approval required."
    summary "- inline gitleaks allow added: \`${h}\`"
  done
fi
if [[ ${#gate_files[@]} -gt 0 ]]; then
  warned=1
  summary "### Merge-gate files changed (human-approval-required)"
  for f in ${gate_files[@]+"${gate_files[@]}"}; do
    echo "::warning file=$(prop "$f"),title=merge-gate file changed::${f} defines or configures the CI merge gate. Human approval required."
    summary "- \`${f}\`"
  done
fi

if [[ "$warned" -eq 0 ]]; then
  echo "No gitleaks suppression or merge-gate file changes in this range."
else
  echo "Gate-config guard: ${#gitleaks_files[@]} gitleaks config file(s), ${#allow_hits[@]} inline allow(s), ${#gate_files[@]} other merge-gate file(s) changed. See warnings above."
fi
