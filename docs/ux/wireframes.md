# Low-fi wireframes

Legend: `[ ]` button, `( )` radio, `< >` link, `{ }` input, `##` heading, `~` live region. Every screen has a skip link, one `<h1>`, landmarks (header, nav, main).

## W1 Mobile 360dp: Hosts

```text
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

```text
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

```text
| < Agent: claude-code · wt/feat-x |
| ACP session acp_7f3a  [Live]     |   state: Live | Detached | Resume available
| tokens 12.4k / 50k cap           |
| Transcript (role=log, polite)    |
|  tool: edit src/a.ts             |
|  ⏸ Waiting approval: apt install |
|     <Open in Inbox>              |
| Tabs: Transcript | Jobs | Tools  |
| [Pause] [Stop]                   |
| Detached: [Resume session]       |   shown only when state = Detached
```

## W4 Mobile 360dp: Approval inbox and detail (see approval-inbox-360.svg)

```text
List                              Detail
| ## Approvals  [Pending v]  |    | < Approval · Pending · expires 14:30 |
| Staging VM package install |    | Requester: agent claude-code (job 41)|
|  Pending · High · 14:30    |    | Host: stg-vm-01 · as: deploy         |
| Rotate connector cert      |    | Command (exact, copyable):           |
|  Executed once · 13:02     |    |  apt-get install -y nginx=1.24.0-1   |
                                  | Changes: +nginx 1.24.0-1 (diff)      |
                                  | Risk: High · Rollback: apt remove     |
                                  | Digest: sha256:9c1e…a47 [Copy]       |
                                  | Evidence: dry-run ok <link>          |
                                  | [Reject]        [Approve…]          |

Variant A, production dual approval:  status `Awaiting second approver (1 of 2)`,
  "Approved by: dana (first)"; Approve enabled only for a different human.
Variant B, own request (read-only):   status Pending; actions replaced by the text
  "You can't approve your own request". Back to list is the only control.
Variant C, `Invalidated - target changed`: no actions; shows "Digest or host fingerprint
  changed since approval. Nothing was run." and [Create new request].
```

Approve opens StepUpDialog (MFA); after success shows `Approved - executing` then final status. No swipe-to-approve (not operable by assistive tech / accidental). Buttons stacked full width if text scaled.

## W5 Mobile 360dp: Audit

```text
| ## Audit   [Filters (3)]     |
| 13:02 alice approved #88     |
|   stg-vm-01 · Executed once  |
| 12:58 agent-cc requested #88 |
| <Load more>  (not infinite scroll) |
```

## W6 Tablet 600-1023dp (768 shown): rail nav + master-detail

```text
+----+---------------------------+---------------------------------------+
|Rail| ## Approvals [Pending v]   | < Approval #88 · Pending · expires 14:30|
|Host| Staging VM pkg install     | Requester / Host / run as              |
|Sess|  Pending · High            | Command (exact, copyable)              |
|Agnt| Rotate connector cert      | Changes (diff, scroll region)          |
|Inbx|  Executed once             | Digest · Risk · Rollback · Evidence    |
|Audt| <Load more>                | [Reject]                [Approve…]     |
+----+---------------------------+---------------------------------------+
 rail 72px (icon + label) | list 320px | detail fluid. Detail replaces list below 600dp.
```

Hosts at 600-1023: two-column card grid. Agent session: transcript left, Jobs/Tools tabs become a right pane (280px). Audit: table with columns time, actor, action, host, outcome; detail drawer overlays from the right. Terminal supports 2 splits.

## W6a Desktop 1024+dp: Hosts

```text
+-----+---------------------------------------------------------------+
| Nav | ## Hosts                [Filter {      }] [+ Add host]        |
|     | Name        Status        OS/arch      Sessions Connector Actions|
|     | stg-vm-01   * Reachable   Linux x86_64   2     Healthy   [Open][⋮]|
|     | nas-lan     ! Retrying    Linux arm64    0     No Install [Open][⋮]|
|     |-------------------------------------+-------------------------+|
|     | Selected host details (panel)       | Install timeline (text) ||
|     | key: SHA256:ab12… pinned            | SSH_VERIFIED … HEALTHY  ||
+-----+-------------------------------------+-------------------------+
```

Table with real `<th>` headers; row actions have text names including the host name.

## W6b Desktop 1024+dp: Agent session

```text
+-----+---------------------------+-------------------+----------------+
| Nav | Transcript (role=log)     | Jobs / logs       | Session        |
|     |  tool: edit src/a.ts      |  job 41 running   | ACP acp_7f3a   |
|     |  ⏸ Waiting approval       |  job 40 done      | State: Live    |
|     |   <Open in Inbox>         |                   | tokens 12.4k/50k|
|     | [Pause] [Stop]            | Tools policy list | [Detach][Resume]|
+-----+---------------------------+-------------------+----------------+
```

## W6c Desktop 1024+dp: Approval inbox (master-detail)

```text
+-----+----------------------+--------------------------------------------+
| Nav | ## Approvals         | Approval #88 · Awaiting second approver (1 of 2)|
|     | [Pending v][Host v]  | Requester · Host · run as · expires 14:30  |
|     | #88 Pending · High   | Command (exact)   | Changes (diff)         |
|     | #87 Executed once    | Digest sha256:9c1e…a47                    |
|     | #86 Invalidated      | Risk · Rollback · Evidence · Approvers 1/2 |
|     |                      | [Reject]                       [Approve…] |
+-----+----------------------+--------------------------------------------+
```

List 360px, detail fluid; same variants as W4 (own request read-only, Invalidated).

## W6d Desktop 1024+dp: Audit

```text
+-----+------------------------------------------------+---------------+
| Nav | ## Audit  Filters: time, actor, host, action,  | Detail drawer |
|     |           outcome, approval id   [Export]      | immutable fields|
|     | Time  Actor  Action        Host      Outcome   | correlation id |
|     | 13:02 alice  approved #88  stg-vm-01 Executed  | Paperclip link |
|     | 12:58 agt-cc requested #88 stg-vm-01 Pending   | redacted output|
|     | <Load more>   Integrity: Verified              |                |
+-----+------------------------------------------------+---------------+
```

## W7 Desktop 1280dp: Terminal workspace

```text
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

Command palette `Ctrl/Cmd+K`. All panes reachable by `F6` / `Shift+F6`; none traps focus except the raw terminal, which exposes a documented escape and a visible "Leave terminal focus" button. Escape chord default: press `Esc` twice quickly, then `Tab`; the chord is configurable in Settings > Keyboard. The defaults avoid chords that OSes intercept (`Ctrl+Shift+Esc` is Windows Task Manager; `Ctrl+Alt+arrow` is GNOME workspace switching), and client-OS reachability is a manual test item.

## Responsive rules

Breakpoints 0-599 / 600-1023 / 1024+. Reflow at 320 CSS px without 2D scroll (except terminal grid and diff, which scroll within a labelled region). No hover-only controls. Respect `prefers-reduced-motion`, `prefers-color-scheme`, `forced-colors`.
