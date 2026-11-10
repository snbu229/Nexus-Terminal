<!-- markdownlint-disable-file MD041 -->
<!-- Policy: docs/process/git-workflow.md. Automatic merging is NOT active: no agent merges; every merge needs board approval. -->

## Paperclip issue

<!-- Required. e.g. EZF-123 with its Paperclip link. Post this PR's link back on the issue. -->

## Change summary

<!-- What changed and why. Link ADRs and docs touched. -->

## Risk class

<!-- Tick exactly one. If in doubt, choose human-approval-required. -->

- [ ] `routine`
- [ ] `human-approval-required`: touches one or more of:
  - [ ] authentication
  - [ ] authorization
  - [ ] SSH credentials or keys
  - [ ] production infrastructure
  - [ ] security policy, including any merge-gate file (`docs/process/git-workflow.md` section 2):
    - anything under `.github/` (including any new workflow) or `scripts/ci/`; branch rules; `docs/process/git-workflow.md`
    - `.gitleaks.toml` or `.gitleaksignore` (at any depth), or an added inline `gitleaks:allow`
    - `lychee.toml`, `.lycheeignore`, `osv-scanner.toml`, or `.markdownlint*` / `.markdownlintignore` (at any depth)
    - any Makefile or `*.mk` file, or anything the `make ci` target runs
  - [ ] deployment

## Checks run

<!-- Every check that applies, each with a link to its output (CI run, attached log). A summary is not evidence. -->

| Check | Result | Output link |
| --- | --- | --- |
| `ci-required` (CI run) | | |
| Lint / build / unit / integration (`make ci`) | | |
| Secret scan (gitleaks) | | |
| Dependency / licence scan | | |
| Other (describe) | | |

## Review status at head SHA

<!-- Approvals bind to a specific commit. Any new commit needs re-review. Update this when the head changes. -->

- Head SHA: `<sha>`
- C1 (A5 QA & Security): pending / approved at `<sha>` / changes requested
- C2 (A1 CTO, or per issue policy): pending / approved at `<sha>` / changes requested
- Human board approval (required for `human-approval-required`): n/a / pending / approved at `<sha>`
