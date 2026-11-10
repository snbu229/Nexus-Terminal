# Nexus Terminal UX flows and accessibility wireframes (NX2-009 / EZF-9)

Status: **M0 design draft, no app code.** Revision 2 addresses the C1 change request. Awaiting C1 re-review and C2 (CTO).

| File                                             | Content                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [flows.md](flows.md)                             | Mermaid journey and state flows (onboarding, terminal, agents, approvals, audit, reconnect) |
| [wireframes.md](wireframes.md)                   | Low-fi responsive wireframes: 360dp mobile, 768dp tablet, 1280dp desktop                    |
| [approval-inbox-360.svg](approval-inbox-360.svg) | SVG wireframe of the mobile approval detail screen                                          |
| [accessibility.md](accessibility.md)             | WCAG 2.2 AA criteria mapped to Nexus screens, plus test checklist                           |
| [design-system.md](design-system.md)             | Original design tokens and components (no Warp assets)                                      |

## Sources (all in-repo, kit at `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/`, commit ccc35cb)

- `PRODUCT.md` journeys 1-8 and non-goals
- `WARP_STYLE_EDITOR_SPEC.md` UX modes, lease, reconnect rules
- `NOTIFICATIONS.md` deep link / approval page contents
- `TELEPORT_IDENTITY_ACCESS.md` two authorization domains
- External: WCAG 2.2 Recommendation, https://www.w3.org/TR/WCAG22/ (W3C Recommendation 12 December 2024; re-fetched 2026-11-10 and SC list checked against it).

## Clean-room statement

Behaviors follow the in-repo spec only. No Warp assets, icons, colors, layout copies, or source were used or viewed. Names ("Command Studio", "command block") are the spec's own. Layouts and tokens here are original.

## Open items / unknowns (not guessed)

1. Of EZF-2 open items I-1..I-7, only **I-3** (macOS connector ship date) affects this UX; the `.pkg` option is marked `[DEP I-3]`. I-4 matters only if a desktop companion is in scope. Wireframes touching these are marked `[DEP]`. Notably: Teleport access-request UI in CE is CLI-only, so host-access requests are shown as "Request via your admin" with a status link, not an in-app approve button (see flows.md F5).
2. No user research or usability testing has occurred. Wireframes are hypotheses.
3. iOS push reliability untested (per NOTIFICATIONS.md); UI never claims instant delivery.
4. Real-device screen-reader testing (VoiceOver, TalkBack, NVDA) is not done; defined as acceptance in accessibility.md section 6.
5. Mermaid diagrams are syntax-checked by eye only; no renderer was available and nothing was installed on the shared host.
