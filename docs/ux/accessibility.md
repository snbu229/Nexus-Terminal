# Accessibility criteria: WCAG 2.2 Level AA

Source: W3C WCAG 2.2 Recommendation (12 December 2024), https://www.w3.org/TR/WCAG22/, fetched 2026-11-10. (2.5.5 Target Size Enhanced is AAA, not AA; it is not required.)

Target: every shipped screen passes all A + AA success criteria; section 1 maps every one of them (applicable or N/A with reason), verified by automated (axe-core, Playwright) and manual checks. Criteria apply at 360dp touch, desktop keyboard, 200% zoom, and 1.3x editor text scale.

## 1. Criteria mapped to Nexus
| SC | Requirement in Nexus |
|---|---|
| 1.1.1 Non-text | Icons have text labels; SVG diagrams have title/desc; status never icon-only |
| 1.3.1 Info/relationships | Landmarks, lists, tables for audit; command blocks are `article`/list items with heading = command |
| 1.2.1-1.2.5 Time-based media | N/A: M0 product has no prerecorded/live audio or video. Re-evaluate if help videos or session recordings with audio are added |
| 1.3.2 Meaningful sequence | DOM order equals reading order (status, requester, host, command, diff, risk, rollback, actions); CSS reordering never changes it |
| 1.3.3 Sensory characteristics | Instructions never rely on position/colour/shape alone ("the button below" is always also named: "Approve") |
| 1.4.2 Audio control | N/A: no auto-playing audio. Terminal bell is visual/haptic only and off by default for audio |
| 1.4.5 Images of text | No text in images; SVG/diagrams use live text; logo is the only exception and carries alt |
| 2.3.1 Three flashes | Visual bell is a single non-flashing highlight (<=1 per second, no red flash); ANSI blink (SGR 5/6) is rendered static with underline by default, and reduce-motion forces it static. Rapid output never flashes the whole viewport |
| 2.4.2 Page titled | Every route sets a unique `<title>`: "Approval #88 - Pending - Nexus"; updated on SPA navigation and announced |
| 2.4.4 Link purpose | Link text names target: "Open #88 in Inbox", never "click here"; list rows include host name in accessible name |
| 2.4.5 Multiple ways | Nav, search/command palette (`Ctrl/Cmd+K`), and filtered lists reach every host/session/approval |
| 2.5.4 Motion actuation | No shake/tilt functions; nothing depends on device motion |
| 3.1.1 Language of page | `<html lang>` set from user locale |
| 3.1.2 Language of parts | Terminal output and command text marked `lang`/`translate=no` where not the UI language |
| 3.2.3 Consistent navigation | Bottom nav / rail / sidebar keep the same order and labels across screens |
| 3.2.4 Consistent identification | Same icon + text for same function (Terminal `>_`, Agent, Folder) everywhere; status vocabulary is single-sourced in design-system.md |
| 1.3.4 Orientation | Works portrait and landscape |
| 1.3.5 Input purpose | `autocomplete` on login/MFA fields |
| 1.4.1 Use of color | Status/risk/diff add/remove have text or symbol (+/-) |
| 1.4.3 / 1.4.11 Contrast | Text 4.5:1 (3:1 large); UI components, focus, and terminal palette 3:1; ANSI palette themes verified; user cannot set below-threshold default |
| 1.4.4 / 1.4.10 Resize/Reflow | 200% text, 320px reflow; terminal and diff scroll in labelled regions |
| 1.4.12 Text spacing | No loss under spacing overrides (editor, cards) |
| 1.4.13 Hover/focus content | Tooltips dismissible, hoverable, persistent |
| 2.1.1 / 2.1.2 Keyboard, no trap | All functions keyboard operable; raw terminal escape chord documented, configurable and reachable on client OSes (default `Esc Esc` then Tab; OS-reserved chords avoided), plus a visible "Leave terminal" button |
| 2.1.4 Character key shortcuts | Single-key shortcuts only when remappable/off, and the escape chord is configurable; terminal keys are exempt as raw-mode input, not app shortcuts |
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
