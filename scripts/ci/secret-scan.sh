#!/usr/bin/env bash
# gitleaks secret scan of a commit range (EZF-28). Run from the repository
# root. CI, the local command in docs/process/git-workflow.md section 3 and
# scripts/ci/test-secret-scan.sh all use this one invocation.
#
#   usage: scripts/ci/secret-scan.sh <git-log-range>   (e.g. origin/main..HEAD)
#
# gitleaks reads `git log -p`, which follows .gitattributes: a PR that marks a
# path `-diff` or `binary` would turn its content into "Binary files differ"
# and hide it from the scan. --text forces a textual patch for every file;
# --no-textconv stops any configured text-conversion filter from rewriting it.
set -euo pipefail

if [[ $# -ne 1 || -z "$1" || "$1" == -* || "$1" == *[[:space:]]* ]]; then
  echo "usage: $0 <git-log-range>   (one revision or range, no options)" >&2
  exit 2
fi
range="$1"

echo "Scanning commit range: $range"
exec gitleaks git --redact --no-banner --verbose --exit-code 1 \
  --log-opts="--text --no-textconv $range" .
