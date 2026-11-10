---
name: mobile-notification-relay
description: Use when building Nexus PWA, in-app, ntfy, Gotify or email notification adapters. Idempotent outbox, rate limits, redaction, 30-minute offline and recovery alerts, local fakes only in dev.
---

# Mobile notification relay

## Use when

A task adds or changes a notification channel, the notification outbox, or alert rules.

Read first: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/NOTIFICATIONS.md`.

## Rules

1. Dev and test use **local fakes only**. Sending to a real ntfy, Gotify, email or push service needs board approval, because it is external egress and may need a paid account.
2. Payloads carry no terminal text, secrets or host credentials (M-D1 plan §5: no terminal text sent anywhere). Send a minimal notice and a link; the detail is shown only after the user authenticates.
3. Delivery goes through an idempotent outbox with a stable message key, so a retried or duplicated delivery sends once.
4. Rate-limit per user and per channel.
5. Raise a host-offline alert after 30 minutes and a recovery alert when it comes back.

## Required negative tests

Redaction (a secret-like canary never reaches the payload); duplicate outbox delivery sends once; rate limit; 30-minute offline alert; recovery alert.

## Exit evidence

Test output against the local fakes, attached to the Paperclip issue.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
