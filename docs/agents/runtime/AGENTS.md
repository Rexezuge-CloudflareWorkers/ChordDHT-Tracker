# ChordDHT-Tracker — Runtime And Configuration

Scope: Wrangler bindings, build output, env vars. Parent index: `../../../AGENTS.md`.

- Root package `@chord-dht-tracker/monorepo`, pnpm workspaces (`apps/*`, `packages/*`).
- `apps/api/wrangler.template.jsonc` is the config template — copy to `wrangler.jsonc` per deployer; no committed `wrangler.jsonc`. CI deploys patch it via `scripts/prepare-wrangler-config.ts` (`WRANGLER_JSONC` full override, `WRANGLER_PATCH_JSON` top-level patch, `WRANGLER_VARS_PATCH_JSON` vars patch).
- `apps/web/dist/` is served as Cloudflare Workers Assets (`assets.directory` in the template). `GET *` serves `SPA_HTML` only when `SERVE_SPA_FROM_WORKER=true`; otherwise unknown paths return 404 so `/tracker/*` routes are never intercepted.
- Worker bindings: D1 `DB` (`chord-dht-tracker-db`), rate limiter `NODE_RATE_LIMITER` (10 req / 60 s per node ID), Secrets Store `CA_PUBLIC_KEY_BASE64` / `ADMIN_SECRET`, DO `CRON_TASKS` (`StaleCleanupWorker`), cron `0 * * * *` (hourly stale cleanup).
- `/tracker/*` requests run inside a D1 session (`createD1SessionEnv`; `x-d1-bookmark` request/response header round-trip in `ChordDHTTrackerWorker.onRequest`, skipped when the binding has no `withSession`). The DO id uses `DURABLE_OBJECT_NAMESPACE_GLOBAL` (`'global'`).
- Stable-base liveness is on-demand from stored node `last_seen`/`status`; the Worker does not actively ping nodes.

## Required bindings (no defaults)

- `DB` — D1 database (`chord-dht-tracker-db`). Migrations in `migrations/`; apply with `pnpm run migrate:local` / `pnpm run migrate:remote`.
- `NODE_RATE_LIMITER` — Cloudflare rate limiter (`namespace_id: 1001`, 10 req / 60 s per node ID).
- `CA_PUBLIC_KEY_BASE64` — Secrets Store secret `chord-dht-tracker-ca-public-key` (base64url 32-byte Ed25519 CA key). When absent/empty, certificate fields are ignored and v1.0 behaviour is preserved.
- `ADMIN_SECRET` — Secrets Store secret `chord-dht-tracker-admin-secret` (shared admin token). When absent or `UNCONFIGURED`, admin auth is disabled.

## Optional vars (defaults in `ConfigurationDefaults.ts`)

| Var                         | Default | Description                                                                                                     |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `MAX_NODES`                 | `1000`  | Maximum anchor rows; evicts oldest by `last_seen` when exceeded                                                 |
| `STALE_THRESHOLD_SECONDS`   | `600`   | Seconds without heartbeat before a node counts as stale; must exceed slowest client interval (quiet mode 300 s) |
| `STALE_CLEANUP_AFTER_HOURS` | `24`    | Hours without heartbeat before hourly cleanup hard-deletes the row                                              |
| `MAX_VNODES_PER_ANCHOR`     | `8`     | Max inline vnodes per anchor registration; reported by `GET /tracker/policy`                                    |
| `MIN_ANCHOR_RATIO`          | `0.20`  | Minimum physical anchor ratio reported by `GET /tracker/policy`                                                 |
| `SERVE_SPA_FROM_WORKER`     | `false` | Serve the SPA from the Worker instead of Workers Assets                                                         |
| `STABLE_BASE_MEMBERS`       | `""`    | Comma-separated stable-base physical anchor HTTPS URIs for `GET /tracker/stable_base`                           |
| `STABLE_BASE_MIN_SIZE`      | `6`     | Minimum live stable-base anchor count; default matches `r=5` plus one                                           |

Add new env vars in `ConfigurationDefaults.ts` (+ `ConfigurationManager` getter and `AppConfiguration` method), not inline. Keep `packages/shared/src/constants/Tracker.ts` in sync.

## Dependency injection (`packages/backend-runtime/src/di/`)

- `AppConfiguration` (`backend-runtime/src/config/AppConfiguration.ts`) — injectable instance view over env parsing (captured env, one method per setting); `ConfigurationManager` statics remain as a thin backward-compatible facade. Prefer injecting `AppConfiguration` (or structural subsets) in new services; mock via constructor deps, not module mocks.
- `Container` — minimal Factory + Singleton DI container (`bind`/`bindValue`/`get`/`resolve`/`createChild`). Composition roots (API worker, cron worker, tests) wire dependencies once; services declare constructor deps on interfaces. Resolve per-request via `container.get(token)` (memoized singleton) or `container.resolve(token)` (fresh instance, request-scoped).
- `createServiceContext(env, overrides?)` — single request-scoped `{ env, logger, clock }` replacing bespoke `*Env` subsets. Prefer extending/deriving from `ServiceContext` over new `*Env` interfaces; never reintroduce `as` env casts in new code. New endpoint/service code resolves via `createRequestScope(env)` + `scope.get(Tokens.X)` — never `new XService(env)` per call.
