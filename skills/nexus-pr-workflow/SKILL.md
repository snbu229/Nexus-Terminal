---
name: nexus-pr-workflow
description: Use for every Nexus code or docs change that ends in a pull request, and for CEO merge duties. Feature branch in a worktree, PR into dev/m-d1 (never push to main), checks attached, C1 then C2 on the head SHA, CEO squash-merges, human approval classes. Overrides the catalog github-pr-workflow skill where they differ.
---

# Nexus PR workflow

## Use when

You are about to commit, push, open, update, review or merge a PR in the Nexus repo. This skill is the Nexus policy layer on top of the catalog skill `github-pr-workflow`; **where they differ, this skill wins.**

Source of truth: the "Git workflow policy" in your agent instructions (board directive on EZF-2), the M-D1 plan (EZF-43 `plan` document, §6), and `docs/process/git-workflow.md` (_pending_: on branch `EZF-28-nx4-164-repo-ci-baseline-pr-policy-files-required-merge-gate-for-the-pr-only-workflow`). If they disagree, the stricter rule applies.

## Branch and PR

1. Work on the task's own feature branch in its Paperclip worktree. Don't switch or rename the branch the harness gave you.
2. **Never commit, push or force-push to `main`**, and never write to `main` through the GitHub API or MCP file tools. Never use `--no-verify`.
3. M-D1 and E-SK work targets **`dev/m-d1`** (protected: PR required, no force push). Other work targets the base named on the issue.
4. Before pushing: scan the diff for secrets, and run every check that applies (see `nexus-devops-ci`). Attach the raw output to the issue.
5. Open the PR with the Paperclip issue linked in the body, then post the PR link and head SHA on the issue.

## Overrides of `github-pr-workflow`

- Rebase or merge from the base **only before the first review**. After review, add new commits; never rebase, amend or force-push a reviewed branch, even if you announce it.
- **The author never merges.** Merges are squash-only and the branch is deleted after.
- Approvals bind to the exact head SHA. Any new commit needs re-review.

## Review and merge

1. C1 then C2, as set in the issue's execution policy (M-D1 default: C1 QA Security (A5), C2 CTO (A1)). C1 and C2 approve the exact head SHA; the author never approves their own work; a new commit needs re-review.
2. Changes requested: fix on the **same branch**, rerun the checks, resubmit.
3. Merge into `dev/m-d1`: **Nexus CEO** squash-merges after both approvals and green checks, matching the approved head SHA, then deletes the branch. Engineers never merge.
4. `dev/m-d1` reaches `main` in **one** PR after the M-D1 gate, with explicit board approval. Until automatic merging is announced, no agent merges anything into `main`.
5. Never bypass failing tests, unresolved review comments or blocked gates.

## Human approval classes

- `routine`: green checks + C1 + C2 at the head SHA (+ board approval for `main` while automatic merging is off).
- `human-approval-required`: anything touching authentication, authorization, SSH credentials or keys, production infrastructure, security policy (including `.github/`, `scripts/ci/`, scanner and lint configs, branch rules) or deployment. Needs a separately recorded human board approval, always. If in doubt, use this class.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
