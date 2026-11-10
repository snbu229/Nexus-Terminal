#!/usr/bin/env bash
# Install pinned, checksum-verified CI tools (EZF-28). Linux x86_64 only
# (GitHub-hosted ubuntu-latest). Every version and SHA-256 below was checked
# against the publisher's release checksum file; bumping one is a reviewed
# change to the merge gate.
#
#   usage: scripts/ci/install-tools.sh <tool>...   (actionlint gitleaks osv-scanner lychee)
#
# Installs into $CI_TOOLS_DIR (default: $RUNNER_TEMP/ci-tools, else ./ci-tools)
# and, on Actions, appends that directory to $GITHUB_PATH.
set -euo pipefail

declare -A URL SHA BIN
URL[actionlint]="https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz"
SHA[actionlint]="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
BIN[actionlint]="actionlint"

URL[gitleaks]="https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz"
SHA[gitleaks]="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
BIN[gitleaks]="gitleaks"

URL[osv-scanner]="https://github.com/google/osv-scanner/releases/download/v2.7.1/osv-scanner_linux_amd64"
SHA[osv-scanner]="fb7dab19a8bd9bbe5c3189f09d4b7ee1820c9553a23bac202648a56efd2f6ee8"
BIN[osv-scanner]=""

URL[lychee]="https://github.com/lycheeverse/lychee/releases/download/lychee-v0.24.2/lychee-x86_64-unknown-linux-gnu.tar.gz"
SHA[lychee]="1f4e0ef7f6554a6ed33dd7ac144fb2e1bbed98598e7af973042fc5cd43951c9a"
BIN[lychee]="lychee-x86_64-unknown-linux-gnu/lychee"

if [[ "$(uname -s)-$(uname -m)" != "Linux-x86_64" ]]; then
  echo "install-tools.sh: only Linux x86_64 is pinned (got $(uname -s)-$(uname -m))" >&2
  exit 1
fi
if [[ $# -eq 0 ]]; then
  echo "usage: $0 <tool>... (one of: ${!URL[*]})" >&2
  exit 2
fi

dest="${CI_TOOLS_DIR:-${RUNNER_TEMP:-$PWD}/ci-tools}"
mkdir -p "$dest"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for tool in "$@"; do
  if [[ -z "${URL[$tool]+set}" ]]; then
    echo "install-tools.sh: unknown tool '$tool'" >&2
    exit 2
  fi
  file="$tmp/${URL[$tool]##*/}"
  curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \
    -o "$file" "${URL[$tool]}"
  echo "${SHA[$tool]}  $file" | sha256sum --check --strict --quiet
  if [[ -z "${BIN[$tool]}" ]]; then
    install -m 0755 "$file" "$dest/$tool"
  else
    tar -xzf "$file" -C "$tmp" "${BIN[$tool]}"
    install -m 0755 "$tmp/${BIN[$tool]}" "$dest/$tool"
  fi
  echo "installed $tool -> $dest/$tool (sha256 ${SHA[$tool]})"
done

if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "$dest" >> "$GITHUB_PATH"
fi
