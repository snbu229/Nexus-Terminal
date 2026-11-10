# UX flows

## F1 Host onboarding (PRODUCT journey 1, 2)
```mermaid
flowchart TD
  A[Sign in + MFA] --> B[Hosts > Add host]
  B --> C[Enter name, address, port, SSH user, auth method]
  C --> D[Probe: fetch host key]
  D --> E{Fingerprint shown<br/>SHA256 + randomart text alt}
  E -- user confirms out-of-band --> F[Pin key, save host]
  E -- cancel --> B
  F --> G[Open terminal, no agent installed]
  F --> H[Optional: Install Connector]
  H --> I[Preview: OS/arch, package .deb/.rpm/.pkg, signature, permissions, rollback]
  I --> J{Approve enrollment<br/>step-up MFA}
  J -- yes --> K[Signed install progress + health]
  J -- no --> F
  K --> L[Connector healthy / failed with troubleshooting link]
  L --> M[Revoke / Uninstall available]
```
Errors: key mismatch later shows blocking `Key changed` screen with no "continue anyway" for non-admins; admin path requires reason + audit. Credentials are entered only in a POST form, never echoed or put in URLs.

## F2 Terminal + Command Studio (journey 3, WARP spec)
```mermaid
stateDiagram-v2
  [*] --> SMART_INPUT
  SMART_INPUT --> INTERACTIVE_PTY: vim/top/ssh/sudo prompt detected or manual toggle
  INTERACTIVE_PTY --> SMART_INPUT: prompt marker (OSC 133) or manual toggle
  SMART_INPUT --> Review: multiline/elevated paste
  Review --> SMART_INPUT: cancel
  Review --> SMART_INPUT: Run (explicit)
  SMART_INPUT --> Detached: network drop (draft kept)
  Detached --> Reattach: auth ok
  Reattach --> SMART_INPUT: same tmux, cursor fetched, prompt "Submit unsent draft?"
  Detached --> Gone: tmux missing
```
Rules shown in UI: one writer lease; spectators see read-only banner with "Request takeover" (audited). Queued keystrokes are never replayed. Mode indicator is text ("Smart" / "Raw") plus icon and announced.

## F3 Agent session (journey 5)
```mermaid
flowchart LR
  A[Agents > New session] --> B[Pick harness, host/worktree, budget cap, tool policy]
  B --> C[Live transcript + status + tokens + job logs]
  C --> D{Sensitive tool call}
  D -- yes --> E[That action paused only; others continue]
  E --> F[Approval created, notify approver]
  F --> G{Decision}
  G -- approved --> H[Executes once, receipt] --> C
  G -- rejected/expired --> I[Agent told denied, continues or blocks] --> C
```
Agent pane never shows approve controls inline for the requester's own approval (separation of duties); it links to the inbox.

## F4 Approval inbox on mobile (journey 6)
```mermaid
sequenceDiagram
  participant N as Phone notification (no secrets)
  participant P as PWA (HTTPS)
  participant S as Server
  N->>P: tap deep link /approvals/{id}
  P->>S: session valid?
  alt not signed in
    P->>P: login (+MFA) then return to same id
  end
  P->>S: GET approval
  S-->>P: host, identity, exact command/diff, risk, rollback, requester, evidence, expiry
  P->>P: user reviews; Approve enabled after details rendered
  P->>S: Approve (step-up MFA challenge)
  S-->>P: result: Executed once / Failed / Expired
  S->>S: audit + receipt to Paperclip issue
```
Offline: inbox shows cached list marked `Stale - last updated hh:mm`; Approve/Reject disabled with reason "Needs connection". Delivery failure never auto-approves; expired approvals show `Expired` and cannot be actioned.

## F5 Host access request [DEP: Teleport CE has CLI-only requests]
User lacks access -> host card shows `No access` + "Request access" -> (CE) screen with request id and instructions for admin; (Enterprise/adapter) in-app status. Nexus approval ledger covers Nexus-mediated actions only and never implies SSH authorization. GitHub repo access is not shown as host access.

## F6 Audit view (journey 6, security)
Filter (time, actor, host, action, outcome, approval id) -> list of AuditRow -> detail drawer (immutable fields, correlation id, linked Paperclip issue, redacted output preview) -> export (requires permission, itself audited). Chain/integrity indicator text: `Verified` / `Gap detected`.

## F7 Reconnect (journey 3)
Banner states: Online -> `Connection lost` (editor stays editable, draft saved locally) -> `Reconnecting, attempt n, retry in Xs` (unlimited until user presses Stop) -> `Restored after mm:ss, same session`. Token expiry routes to login, then returns to the session.
