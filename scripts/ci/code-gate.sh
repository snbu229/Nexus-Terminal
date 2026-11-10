#!/usr/bin/env bash
# `code` CI gate (EZF-28). Run from the repository root.
#
#   - A Makefile `ci` target exists        -> run `make ci`; its exit code wins.
#   - Source under apps/ packages/ services/
#     but no `ci` target                   -> FAIL (code never lands untested).
#   - No source there yet                  -> skip with an explicit notice.
#
# "Source" is any file under those directories, tracked or untracked (but not
# gitignored-and-untracked), except Markdown and .gitkeep placeholders.
set -euo pipefail

CODE_DIRS=(apps packages services)

# Returns 0 if a `ci` target exists, 1 if it does not. Any other Makefile
# problem (make missing, parse error) is fatal rather than read as "no target".
has_ci_target() {
  [[ -f Makefile || -f makefile || -f GNUmakefile ]] || return 1
  if ! command -v make >/dev/null 2>&1; then
    echo "::error title=code gate::A Makefile exists but 'make' is not installed."
    exit 1
  fi
  local out
  if out="$(make -n ci 2>&1)"; then
    return 0
  fi
  if [[ "$out" == *"No rule to make target"*"ci"* ]]; then
    return 1
  fi
  echo "::error title=code gate::'make -n ci' failed for a reason other than a missing target:"
  echo "$out"
  exit 1
}

list_source_files() {
  git ls-files --cached --others --exclude-standard -- "${CODE_DIRS[@]}" \
    | grep -Ev '(\.md$|(^|/)\.gitkeep$)' || true
}

if has_ci_target; then
  echo "Makefile 'ci' target found: running 'make ci'"
  exec make ci
fi

src="$(list_source_files)"
if [[ -n "$src" ]]; then
  count="$(printf '%s\n' "$src" | wc -l | tr -d ' ')"
  echo "::error title=code gate::${count} source file(s) under ${CODE_DIRS[*]} but no 'ci' target in a Makefile. Add 'make ci' (lint, build, unit, integration) before landing code."
  printf '%s\n' "$src" | head -n 50
  exit 1
fi

echo "::notice title=code gate::No source files under ${CODE_DIRS[*]} and no 'ci' target; code checks skipped. This job fails as soon as source lands without 'make ci'."
