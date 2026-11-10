---
name: third-party-skill-audit
description: Use before any skill, plugin, MCP server or marketplace package enters the Nexus skills library or an agent's toolset. Checks origin, SPDX licence, pin and hashes, every file, executable content, secrets, permission widening and gate weakening.
---

# Third-party skill audit

## Use when

Someone proposes importing, forking, assigning or installing a skill, Claude Code plugin, MCP server or marketplace package. This is the checklist SK-1 (EZF-65) used.

## Checklist (record a row per item)

1. **Origin:** repository or package, maintainer, and how you obtained it.
2. **Licence:** SPDX identifier, with the source you read it from (`LICENSE` file or package manifest). "Unverified" blocks import.
3. **Pin:** commit SHA, or package version plus content hash.
4. **Hashes:** recompute the SHA-256 of every file you fetched and compare with the declared value.
5. **Inventory:** list every file, and every non-markdown file by name and size.
6. **Executable content:** scripts, install steps, `npx`, `curl | sh`, hooks or MCP servers make the item **executable**, which needs board authorization before install.
7. **Secrets:** none embedded, none requested in prose.
8. **Permission widening:** broad scopes, production access, root, new hosts.
9. **Gate weakening:** anything that lets the author self-approve, waive a failing check, force-push after review or bypass hooks.
10. **External publish or egress:** uploads, public hosting, telemetry.
11. **References:** every referenced file resolves from a repo worktree; cross-references to other skills are pinned and audited too.

A file the auditor cannot read (for example a catalog asset the API won't preview) is **unreviewed** and blocks import of that file.

## Deliverable

One table: item, verdict (**approve**, **approve after fixes**, **reject**), exact fixes, reason. Save it as an issue document. Don't install, import or assign anything during the audit.

## Review

C1 and C2 approve the exact head SHA; the author never approves their own work; a new commit needs re-review.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
