# Notifications, mobile actions and relayer

## Channels
- In-app approval inbox and activity feed — authoritative source of truth.
- PWA Web Push over HTTPS. Mobile client can be added later; require device registration, MFA and permission scope.
- Email/SMTP, self-hosted ntfy or Gotify for phone notifications, optional Telegram/Slack/webhook. WhatsApp via provider adapter with secure secrets/consent if needed.
- iOS truly instant push depends on Apple platform requirements/APNs (and may require an upstream service); test it rather than promise 100% immediate delivery.

## Incidents
- `connection_lost`: notify only if preference enabled; early warning threshold e.g. 5 minutes.
- `host_offline_30m`: one high-priority notice at 30m; **do not end retries**. Respect escalation cooldown and per-host mute window.
- `connection_restored`: one recovery notice containing duration and same session attach link; revalidate status.
- `agent_waiting_for_approval`: notify assigned on-call approver immediately, duplicate suppression keyed `approval_id`.
- `job_failed`, `agent_blocked`, `security_event`, `connector_update_failed` with user-configured channel/severity.

## UI flow
Phone notification: "Nexus approval required — Staging VM package install" + secure deep link. Link opens HTTPS PWA and requires signed-in account; no approval authority in notification itself. Full page: host, identity, exact package/version and changes, risk, rollback, requester/agent, test evidence, Approve/Reject. Step-up MFA on sensitive operations.

## Delivery semantics
Persist `notification_event` then enqueue via transactional outbox; per-recipient delivery attempts have idempotency key, bounded retries and dead-letter recovery. User may ACK incident, mute channels or set quiet hours, but critical security alerts override only where explicit policy permits. Do not include SSH usernames, internal addresses, tokens, chat transcript or model secrets in push payload by default.

## Configurable defaults
Alert at 5m and 30m; continue attempts without deadline. Notification delivery failure must not falsely auto-approve. Approval pending has its own finite policy validity or revocation; durable agent sessions remain paused safely.
