# Git workflow and merge policy (PR-only)

**Source:** board directive on Paperclip issue EZF-2 (comment 6dcfddb1, 2026-11-10). This file mirrors the "Git workflow policy" section in every agent's instructions. Live enforcement status is kept in the EZF-2 document `git-workflow-policy`. If the two disagree, the stricter rule applies until the board resolves it.

> **Automatic merging is NOT active.** It stays off until branch protection on `main` requires the `ci-required` check, the agent identity is separated from the admin identity, and the board announces activation. Until then, **every merge into `main` needs the board's explicit approval, and no agent merges any PR.**

## 1. Rules

1. **Feature branch only.** Each task is done on its own feature branch (`<issue>-<slug>`) in an isolated Paperclip worktree. Nobody commits, pushes or force-pushes to `main`, or writes to `main` through the GitHub API or MCP file tools. GitHub branch protection rejects these; the local pre-push hook is only a backstop. Never bypass it with `--no-verify`.
2. **Pull request.** When the work is ready, scan for secrets, push the branch to `origin` and open a PR against `main` using [the PR template](../../.github/pull_request_template.md). Link the Paperclip issue in the PR body and post the PR link on the issue.
3. **Checks.** Run every check that applies (lint, build, unit, integration, security, secret and dependency scans) and attach the output to the issue. A summary is not evidence. The PR's CI must be green before review: the single required check is **`ci-required`** (see section 3).
4. **Review.** C1 by A5 (QA & Security), then C2 by A1 (CTO), or as set in the issue's execution policy. Both are recorded in Paperclip against the **PR head SHA**. Any new commit invalidates them and needs re-review. Never approve your own work.
5. **Rework loop.** If changes are requested, fix them on the **same branch**, rerun the checks, and resubmit for review. Never force-push a branch that has been reviewed.
6. **Merge.** Squash merge only (linear history), then delete the branch. Never merge a PR you authored. Once automatic merging is active, the merge executor is the final C2 approver (never the author). They run `gh pr merge --squash --delete-branch --match-head-commit <approved SHA>` only after Paperclip shows C1 and C2 approved at that SHA, then post the merge SHA, PR link and CI run on the issue.
7. **No bypassing.** Failing tests, unresolved review comments and blocked gates are never bypassed, skipped or overridden.

## 2. Risk classes

| Class | Applies to | Merge requires |
| --- | --- | --- |
| `routine` | Everything not in the human-approval class | Green `ci-required` + C1 + C2 at the head SHA (+ board approval while automatic merging is off) |
| `human-approval-required` | Changes touching **authentication, authorization, SSH credentials or keys, production infrastructure, security policy (including CI workflows, branch rules and this document), or deployment** | All of the above + a separately recorded **human board approval**, even after automatic merging is enabled |

If in doubt, use `human-approval-required`. Changes to `.github/`, `scripts/ci/`, `.markdownlint-cli2.jsonc` or this file are always `human-approval-required`.

## 3. The CI merge gate (`.github/workflows/ci.yml`)

Runs on every pull request to `main` and every push to `main`. It uses GitHub-hosted `ubuntu-latest` runners and a read-only token, with no repository secrets and no `pull_request_target`. Actions are pinned to full commit SHAs and tool binaries by SHA-256 in `scripts/ci/install-tools.sh`.

| Job | What it enforces |
| --- | --- |
| `workflow-lint` | `actionlint` (with shellcheck) on all workflows; `shellcheck` on `scripts/ci/*.sh` |
| `docs` | `markdownlint-cli2` (config in `.markdownlint-cli2.jsonc`; the read-only spec kit `docs/reference/` is excluded) and an **offline** relative-link and anchor check with `lychee` over every tracked `*.md`, including `docs/reference/`. No external URLs are fetched. |
| `security` | `gitleaks` over the PR's commit range (on push: the pushed range), failing on any finding; `osv-scanner` dependency vulnerability scan with licence summary, which passes while there are no manifests |
| `code` | Self-tests the gate, then runs `make ci` if the target exists. **Fails** if source files exist under `apps/`, `packages/` or `services/` without a `ci` target. Skips with a notice only while those directories hold no source. |
| `ci-required` | Aggregator. Fails unless **every** job above succeeded (failure, cancelled or skipped all fail). This is the only check branch protection references. **Do not rename it.** |

Future code lanes add their lint, build, unit and integration tests behind `make ci`; they do not add new required checks.

### Running the checks locally (Linux x86_64)

```sh
export CI_TOOLS_DIR="$HOME/.cache/nexus-ci-tools"; export PATH="$CI_TOOLS_DIR:$PATH"
scripts/ci/install-tools.sh actionlint gitleaks osv-scanner lychee
actionlint
npx --yes markdownlint-cli2@0.24.0 '**/*.md' '.github/**/*.md'
git ls-files -z -- '*.md' | xargs -0 lychee --offline --include-fragments --no-progress --
gitleaks git --redact --exit-code 1 --log-opts="origin/main..HEAD" .
osv-scanner scan source --recursive --allow-no-lockfiles --licenses .
scripts/ci/test-code-gate.sh && scripts/ci/code-gate.sh
```

Never test secret detection by pushing a secret-like string. Use a throwaway local repository.

## 4. Changing this policy

This file, the workflow and the CI scripts define the merge gate. Changes follow this same process in the `human-approval-required` class. Branch protection, rulesets and repository settings are changed only by the board or by Nexus CEO at the board's request, never as part of a PR.
