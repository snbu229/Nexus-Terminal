# @nexus/api (dev only)

Fastify server for the M-D1 local demo. **There is no authentication.** It serves fixture data only and must never be exposed beyond the developer machine or the dev compose network.

## Run

```sh
pnpm --filter @nexus/api dev      # watch mode; sets NEXUS_DEV_MODE=1 for you
pnpm --filter @nexus/api start    # no default: refuses to start without NEXUS_DEV_MODE=1
```

## Guard rules

| Env                         | Default                 | Effect                                                                                                                              |
| --------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `NEXUS_DEV_MODE`            | (unset)                 | Must be `1`, otherwise the process exits non-zero.                                                                                  |
| `NEXUS_API_HOST`            | `127.0.0.1`             | Non-loopback hosts are refused unless `NEXUS_DEV_COMPOSE=1`.                                                                        |
| `NEXUS_DEV_COMPOSE`         | (unset)                 | `1` only inside the dev compose network.                                                                                            |
| `NEXUS_API_PORT`            | `3000`                  | TCP port.                                                                                                                           |
| `NEXUS_API_ALLOWED_HOSTS`   | loopback names + port   | Exact `Host` values accepted (DNS-rebinding guard). Required with `NEXUS_DEV_COMPOSE=1`; comma-separated `host:port`, no wildcards. |
| `NEXUS_WEB_ORIGIN`          | `http://127.0.0.1:5173` | The single allowed web origin (CORS and Origin check, no `*`).                                                                      |
| `NEXUS_LOG_LEVEL`           | `info`                  | pino level.                                                                                                                         |
| `NEXUS_MAX_SESSIONS`        | `8`                     | Cap on concurrent terminal sessions (`429 too_many_sessions`).                                                                      |
| `NEXUS_SESSION_IDLE_MS`     | `900000`                | A session with no socket and no activity for this long is closed and removed.                                                       |
| `NEXUS_REPLAY_BUFFER_BYTES` | `1048576`               | Output kept per session for `resume` replay.                                                                                        |

A request whose `Host` is not allowed gets `403 host_not_allowed`, even without an `Origin` (blocks DNS rebinding). `localhost` counts as loopback only as far as your resolver does. Router errors (over-long ids, bad percent-encoding) return `400 bad_request` without echoing the URL. A request with an `Origin` header other than `NEXUS_WEB_ORIGIN` gets `403 origin_not_allowed`. Requests with no `Origin` (curl, health checks) are accepted. Request bodies are limited to 128 KiB (`413 payload_too_large`). Logs record only method, path (no query) and status, never bodies, headers or env.

## Routes

`GET /healthz`, `GET /readyz`, `GET /api/v0/hosts`, `GET /api/v0/hosts/:id`. Every body is validated by `@nexus/contracts` and carries `dev: true`. Errors use `{ "error": { "code", "message" } }`.

## Terminal sessions

`POST/GET /api/v0/terminal-sessions`, `GET/DELETE /api/v0/terminal-sessions/:id`, and `WS /api/v0/terminal-sessions/:id/stream` (frames per `@nexus/contracts`). Hosts with `terminalProvider` `local-sandbox` open a scrubbed local shell, `ssh-dev` hosts open the same shell through an in-process ssh2 server with a pinned ephemeral host key, and `none` hosts return `409`.

- Output frames carry a per-session `seq`. A client sends `{type:"resume", afterSeq}` after connecting (use `0` for a first connection); the server replays retained output after that seq and then streams live, with no gap and no duplicates. A socket that never sends `resume` gets live output only.
- The session outlives its socket. If the ring buffer has dropped output older than `afterSeq + 1`, the first replayed `seq` is higher than expected; the contract has no explicit gap frame in v0.
- The upgrade checks `Host` and requires `Origin` to equal `NEXUS_WEB_ORIGIN` (a missing Origin is refused with `403`). Messages over 80 KiB close the socket with `1009`; frames that fail the contract close it with `1008`. At most 4 sockets per session.
- Not a security boundary: the local sandbox runs as the API's own user with a scrubbed env (`PATH`, `TERM`, `LANG`, `HOME`, `SHELL`), a temp HOME/cwd, and no isolation beyond that. Command-block markers (OSC 133) are unauthenticated dev markers.

## Platform compatibility

Node.js (>=24) with no compiled modules; the terminal sandbox also needs `python3` and `bash` (or `sh`) on `PATH`. Tested on linux amd64; darwin and arm64 are expected to work but are not yet tested here. Dev only, no installer or service unit.
