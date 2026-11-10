# @nexus/api (dev only)

Fastify server for the M-D1 local demo. **There is no authentication.** It serves fixture data only and must never be exposed beyond the developer machine or the dev compose network.

## Run

```sh
pnpm --filter @nexus/api dev      # watch mode; sets NEXUS_DEV_MODE=1 for you
pnpm --filter @nexus/api start    # no default: refuses to start without NEXUS_DEV_MODE=1
```

## Guard rules

| Env                 | Default                 | Effect                                                         |
| ------------------- | ----------------------- | -------------------------------------------------------------- |
| `NEXUS_DEV_MODE`    | (unset)                 | Must be `1`, otherwise the process exits non-zero.             |
| `NEXUS_API_HOST`    | `127.0.0.1`             | Non-loopback hosts are refused unless `NEXUS_DEV_COMPOSE=1`.   |
| `NEXUS_DEV_COMPOSE` | (unset)                 | `1` only inside the dev compose network.                       |
| `NEXUS_API_PORT`    | `3000`                  | TCP port.                                                      |
| `NEXUS_WEB_ORIGIN`  | `http://127.0.0.1:5173` | The single allowed web origin (CORS and Origin check, no `*`). |
| `NEXUS_LOG_LEVEL`   | `info`                  | pino level.                                                    |

A request with an `Origin` header other than `NEXUS_WEB_ORIGIN` gets `403 origin_not_allowed`. Requests with no `Origin` (curl, health checks) are accepted. Request bodies are limited to 128 KiB (`413 payload_too_large`). Logs record only method, path (no query) and status, never bodies, headers or env.

## Routes

`GET /healthz`, `GET /readyz`, `GET /api/v0/hosts`, `GET /api/v0/hosts/:id`. Every body is validated by `@nexus/contracts` and carries `dev: true`. Errors use `{ "error": { "code", "message" } }`.

## Platform compatibility

Pure Node.js (>=24), no native modules: linux and darwin, amd64 and arm64. Dev only, no installer or service unit.
