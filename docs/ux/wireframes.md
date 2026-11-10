# Low-fi wireframes

Legend: `[ ]` button, `( )` radio, `< >` link, `{ }` input, `##` heading, `~` live region. Every screen has a skip link, one `<h1>`, landmarks (header, nav, main).

## W1 Mobile 360dp: Hosts
```
+--------------------------------+ 360
| Nexus      [Search] [Bell 2]   |  header
+--------------------------------+
| ## Hosts            [+ Add]    |
| {Filter hosts            }     |
| +----------------------------+ |
| | stg-vm-01   [* Reachable]  | |
| | Linux x86_64 · 2 sessions  | |
| | [Open terminal]  [Details] | |
| +----------------------------+ |
| | nas-lan     [! Retrying]   | |
| | Retrying since 12:04       | |
| +----------------------------+ |
+--------------------------------+
| Hosts | Sessions | Agents | Inbox(2) | More |  bottom nav, 5 x >=44px
```

## W2 Mobile 360dp: Terminal + Command Studio
```
+--------------------------------+
| < stg-vm-01  tmux:main [Smart] |  mode toggle is a button, text label
| ~ Live · you hold input        |
+--------------------------------+
| $ ls  (command block)    exit 0|
|   file_a file_b         [ ⋮ ]  |  block menu: Copy, Edit as draft, Rerun*, Share redacted
| $ make test              exit 2|
+--------------------------------+
| {Draft editor, multiline     } |
| {                            } |
| [Esc][Tab][Ctrl][↑][↓]  [Run]  |  extra-keys row; Run = explicit
+--------------------------------+
```
Keyboard open: block list shrinks, editor and Run remain visible (visualViewport). Raw mode: editor hidden, xterm focus, hardware keys passed through, `[Switch to Smart]` button always visible. Rerun* needs confirm for destructive/cross-host.

## W3 Mobile 360dp: Agent session
```
| < Agent: claude-code · wt/feat-x |
| [Live] tokens 12.4k / 50k cap    |
| Transcript (role=log, polite)    |
|  tool: edit src/a.ts             |
|  ⏸ Waiting approval: apt install |
|     <Open in Inbox>              |
| Tabs: Transcript | Jobs | Tools  |
| [Pause] [Stop]                   |
```

## W4 Mobile 360dp: Approval inbox and detail (see approval-inbox-360.svg)
```
List                              Detail
| ## Approvals  [Pending v]  |    | < Approval · Pending · expires 14:30 |
| Staging VM package install |    | Requester: agent claude-code (job 41)|
|  Pending · High · 14:30    |    | Host: stg-vm-01 · as: deploy         |
| Rotate connector cert      |    | Command (exact, copyable):           |
|  Executed once · 13:02     |    |  apt-get install -y nginx=1.24.0-1   |
                                  | Changes: +nginx 1.24.0-1 (diff)      |
                                  | Risk: High · Rollback: apt remove     |
                                  | Evidence: dry-run ok <link>          |
                                  | [Reject]        [Approve…]          |
```
Approve opens StepUpDialog (MFA); after success shows `Approved - executing` then final status. No swipe-to-approve (not operable by assistive tech / accidental). Buttons stacked full width if text scaled.

## W5 Mobile 360dp: Audit
```
| ## Audit   [Filters (3)]     |
| 13:02 alice approved #88     |
|   stg-vm-01 · Executed once  |
| 12:58 agent-cc requested #88 |
| <Load more>  (not infinite scroll) |
```

## W6 Tablet 768dp
Rail nav left (icons+labels), master-detail: list 320px | detail. Terminal supports 2 splits.

## W7 Desktop 1280dp: Terminal workspace
```
+-----+-----------------------------------------------+------------+
| Nav | Tabs: [stg-vm-01 main][nas-lan][agent-41] [+] | Inspector  |
|     +-----------------------------------------------+ (blocks,   |
| Hosts| Command blocks (scroll, role=log)            |  files,    |
| Sess.|                                               |  agent)    |
| Agent| ┌ Draft editor (CodeMirror) ─────────────┐   |            |
| Inbox| └ [Run] Shift+Enter newline · Mode: Smart┘   |            |
| Audit+-----------------------------------------------+------------+
| Status bar: Live · lease: you · host key pinned                      |
```
Command palette `Ctrl/Cmd+K`. All panes reachable by `F6`/`Ctrl+Alt+arrow`; none traps focus except the raw terminal, which exposes a documented escape (`Ctrl+Shift+Esc` then Tab) and a visible "Leave terminal focus" button.

## Responsive rules
Breakpoints 0-599 / 600-1023 / 1024+. Reflow at 320 CSS px without 2D scroll (except terminal grid and diff, which scroll within a labelled region). No hover-only controls. Respect `prefers-reduced-motion`, `prefers-color-scheme`, `forced-colors`.
