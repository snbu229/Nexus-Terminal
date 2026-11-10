# Original design system (draft)

Name: **Nexus UI**. All values are original placeholders; contrast ratios are computed targets to be verified in CI (axe + manual).

## Principles
1. Server state is truth: UI labels *pending*, *stale*, *offline*, *reconnecting* distinctly; never shows optimistic "approved/sent".
2. Distinct constructs are distinct visuals: **Terminal** (`>_` icon, tmux id), **File mount/SFTP** (folder icon), **Agent/ACP session** (spark-bot icon, ACP id). Always an icon + text label, never color alone (PRODUCT.md non-goals).
3. No credential, grant token or approval token in any URL, query string, or fragment. Deep links carry opaque ids only (`/approvals/{approval_id}`) and require sign-in.
4. Dangerous actions need preview, explicit button, and step-up MFA where policy says so.

## Tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| surface | #FFFFFF | #12151A | page |
| text | #14181F (16.9:1) | #E8ECF2 (14.5:1) | body |
| text-muted | #4A5565 (7.4:1) | #A9B3C2 (8.6:1) | secondary |
| primary | #0B5FD0 | #6FA8FF | actions, focus ring |
| danger | #B3261E | #FF8A80 | destructive, deny |
| warn | #8A5A00 | #FFC857 | pending, stale |
| ok | #1B6E3C | #7FD99A | success |
Focus ring: 2px solid primary + 2px offset, min 3:1 vs adjacent colors. Spacing scale 4/8/12/16/24/32. Touch target min 44x44 CSS px (exceeds WCAG 2.2 SC 2.5.8 24px). Type: system UI stack, mono stack for terminal; base 16px, must reflow to 200% and scale to 1.3x in editor and 2x elsewhere.

## Components
AppShell (bottom nav on <600dp, rail 600-1023, sidebar >=1024), StatusPill (icon+text), HostCard, SessionTab, CommandBlock, DraftEditor, LeaseBanner, ApprovalCard, DiffViewer, StepUpDialog, AuditRow, Toast/LiveRegion, ConnectionBanner.

## Status vocabulary (single source)
Host: `Reachable`, `Unreachable (retrying)`, `Key changed - blocked`, `Unverified`.
Session: `Live`, `Detached (tmux running)`, `Reconnecting (attempt n)`, `Gone (tmux not found)`.
Approval: `Pending`, `Approved - executing`, `Executed once`, `Rejected`, `Expired`, `Revoked`, `Delivery pending` (offline queued).
Offline: UI shows `Queued - not sent` for actions made offline; approvals are never queued client-side (approve requires live server + step-up).
