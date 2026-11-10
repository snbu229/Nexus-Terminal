# Accessibility criteria: WCAG 2.2 Level AA

Target: every shipped screen passes all A + AA success criteria below, verified by automated (axe-core, Playwright) and manual checks. Criteria apply at 360dp touch, desktop keyboard, 200% zoom, and 1.3x editor text scale.

## 1. Criteria mapped to Nexus
| SC | Requirement in Nexus |
|---|---|
| 1.1.1 Non-text | Icons have text labels; SVG diagrams have title/desc; status never icon-only |
| 1.3.1 Info/relationships | Landmarks, lists, tables for audit; command blocks are `article`/list items with heading = command |
| 1.3.4 Orientation | Works portrait and landscape |
| 1.3.5 Input purpose | `autocomplete` on login/MFA fields |
| 1.4.1 Use of color | Status/risk/diff add/remove have text or symbol (+/-) |
| 1.4.3 / 1.4.11 Contrast | Text 4.5:1 (3:1 large); UI components, focus, and terminal palette 3:1; ANSI palette themes verified; user cannot set below-threshold default |
| 1.4.4 / 1.4.10 Resize/Reflow | 200% text, 320px reflow; terminal and diff scroll in labelled regions |
| 1.4.12 Text spacing | No loss under spacing overrides (editor, cards) |
| 1.4.13 Hover/focus content | Tooltips dismissible, hoverable, persistent |
| 2.1.1 / 2.1.2 Keyboard, no trap | All functions keyboard operable; raw terminal escape sequence documented and a visible "Leave terminal" button |
| 2.1.4 Character key shortcuts | Single-key shortcuts only when remappable/off; terminal keys are exempt as raw-mode input, not app shortcuts |
| 2.2.1 Timing adjustable | Approval expiry is shown with countdown; expiry is a security policy (essential exception), but reviewer can see time left; session timeout warns before logout with option to extend via re-auth |
| 2.2.2 Pause/stop/hide | Streaming transcript/log has Pause auto-scroll |
| 2.3.3 (AAA, adopted) | Respect reduced motion anyway |
| 2.4.1 Bypass blocks | Skip links to main, terminal, draft editor |
| 2.4.3 / 2.4.7 / 2.4.11 Focus order, visible, not obscured | Sticky headers/bottom nav/keyboard never hide focused element |
| 2.4.6 Headings and labels | One h1 per screen, descriptive |
| 2.5.1 Pointer gestures | No path-based gesture required; no swipe-to-approve |
| 2.5.2 Pointer cancellation | Actions fire on up-event; Approve/Run never on down |
| 2.5.3 Label in name | Accessible name contains visible label |
| 2.5.7 Dragging | Tab reorder/split resize have button/keyboard alternative |
| 2.5.8 Target size | >=44px (spec) exceeds 24px minimum |
| 3.2.1-3.2.2 | Focus/input never auto-submits a command |
| 3.2.6 Consistent help | Help/troubleshooting link in same place on all screens |
| 3.3.1-3.3.4 Errors, labels, error prevention (legal/financial/data) | Inline text errors; destructive and privileged actions need review + confirm |
| 3.3.7 Redundant entry | Draft persists across reconnect; no re-typing host details after probe |
| 3.3.8 Accessible authentication | MFA supports passkey/WebAuthn, TOTP with paste allowed; no cognitive tests or blocked paste |
| 4.1.2 Name/role/value | Custom controls use native elements or full ARIA patterns |
| 4.1.3 Status messages | Live regions for connection state, approval result, toasts |

## 2. Terminal-specific
- Command blocks exposed as a navigable structure independent of xterm canvas; each has command, host, exit status as text. Use xterm accessibility/screen-reader mode when enabled; offer "Accessible output view" (plain text list) as alternative.
- Output live region is `role=log`, `aria-live=off` by default with user-togglable announce of command completion + exit code (avoid flooding).
- CodeMirror draft: label "Command draft", announces mode (Smart/Raw), multiline, Run button name includes "Run command".
- Mode change and lease change announced politely: "Raw terminal mode", "You hold input", "Read-only: spectator".
- Mobile: on-screen extra-key row operable by screen reader; soft keyboard does not hide the draft or Run.

## 3. Approval-specific
- Details read in logical order: status, requester, host, command, diff, risk, rollback, then actions.
- Approve disabled state includes reason text (not just dimmed). Step-up dialog traps focus legitimately, restores focus on close, Esc cancels.
- Diff add/remove uses +/- text and not just color; copy button for command.
- Result announced via `role=status`.

## 4. Offline / pending accuracy
Each of `Stale`, `Queued - not sent`, `Reconnecting`, `Expired` is visible text and announced; no UI shows success until server confirms.

## 5. Automated gates (proposed for later implementation tickets)
axe-core in Playwright for every route in light, dark, forced-colors; viewport 360x640 and 1280x800; keyboard-only e2e for onboarding, send command, approve; Lighthouse a11y >= 95 as smoke only (not a substitute).

## 6. Manual acceptance (not yet performed)
VoiceOver iOS Safari, TalkBack Android Chrome, NVDA+Firefox/Chrome, VoiceOver macOS; 200% zoom; 1.3x editor scale; voice control smoke. Record results in issue evidence.
