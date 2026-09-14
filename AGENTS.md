# AGENTS.md

Guidance for agents working in ChordDHT-Tracker. This is the global index — follow the links to scoped sub-guides before working in an area.

## Overview

ChordDHT-Tracker is a Cloudflare Worker API that tracks nodes in a Chord DHT (Distributed Hash Table) ring, with a Vite React management UI in a pnpm workspace (`@chord-dht-tracker/monorepo`, `packageManager: pnpm@11.2.2`, workspaces `apps/*` + `packages/*`). The API provides endpoints for node registration, heartbeats, seed discovery, ring statistics, vnode policy, and v5.0 stable-base monitoring.

- **Core**: `apps/api` serves Hono routes and the SPA shell; hourly stale cleanup runs via the `CRON_TASKS` DO (`StaleCleanupWorker` via `TaskRegistry` in `apps/background`) — see `apps/api/AGENTS.md` and `apps/background/AGENTS.md`.
- **Composition**: per-request DI via `createRequestScope(env)` (`Container` + `Tokens`) from `@chord-dht-tracker/backend-services/composition`; never `new XService(env)` in new code. See `docs/agents/runtime/AGENTS.md`.
- **Packages**: `packages/shared` (constants, models, schemas, utils), `packages/backend-errors` (error taxonomy), `packages/backend-runtime` (DI + config), `packages/backend-data` (DAOs, crypto, D1 utils), `packages/backend-services` (domain services + composition root). See Index below.

## Cloudflare Documentation

STOP. Cloudflare Workers APIs, limits, and product behavior change frequently. Before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, Workers AI, or Agents SDK task, retrieve current official documentation.

- Workers docs: https://developers.cloudflare.com/workers/
- Cloudflare MCP docs: https://docs.mcp.cloudflare.com/mcp
- Node.js compatibility: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- Worker errors: https://developers.cloudflare.com/workers/observability/errors/

For limits and quotas, retrieve the product's current `/platform/limits/` page, for example `/workers/platform/limits/`.

Retrieve API references and limits from the relevant product docs:

- `/workers/`
- `/d1/`

Error-specific guidance:

- Error 1102 means CPU or memory was exceeded; retrieve current limits from `/workers/platform/limits/`.
- For any other Worker error, use the current Worker errors docs.

## Commands

Plain `pnpm` is canonical (CI uses the `.github/actions/setup-env` composite: `pnpm/action-setup@v4` + `actions/setup-node@v4` Node 24 + `pnpm install` via `retry-step`). No `source ~/.customrc`, no `volta run` prefix.

```bash
pnpm install
pnpm -r typecheck && pnpm run lint && node scripts/check-god-files.mjs && pnpm run test:coverage && pnpm run test:integration
pnpm run typecheck   # pnpm -r typecheck + root tsc
pnpm run test        # vitest run (unit, excludes test/integration)
pnpm run test:coverage
pnpm run test:integration
pnpm run build       # pnpm -r build; only @chord-dht-tracker/web has a build script
pnpm run lint        # eslint --fix --quiet . (auto-fixes)
pnpm run dev
pnpm run deploy
pnpm run typegen
pnpm run migrate:local    # local D1
pnpm run migrate:remote   # production D1
```

Notes: `wrangler.template.jsonc` is the config template — copy to `wrangler.jsonc` per deployer, no committed `wrangler.jsonc` (see `docs/agents/runtime/AGENTS.md`). God-file guard (`scripts/check-god-files.mjs`, soft 300 / hard 400 LOC) is a strict CI gate (no `continue-on-error`).

Cloudflare command equivalents:

| Command               | Purpose                   |
| --------------------- | ------------------------- |
| `npx wrangler dev`    | Local Worker development  |
| `npx wrangler deploy` | Deploy to Cloudflare      |
| `npx wrangler types`  | Generate TypeScript types |

Run `pnpm run typegen` after changing bindings in Wrangler config.

## Architecture

- `apps/api/src/index.ts` exports the default Cloudflare Worker fetch handler using `ChordDHTTrackerWorker`.
- `apps/api/src/workers/ChordDHTTrackerWorker.ts` registers Hono routes from file-routed endpoint classes (`registerTrackerRoutes`); `onRequest` wraps `/tracker/*` in a D1 session (`x-d1-bookmark` round-trip); `onScheduled` forwards to the `CRON_TASKS` DO stub.
- `apps/api/src/endpoints/` contains file-routed endpoint classes, one file per HTTP method per route.
- `apps/api/src/endpoints/IBaseRoute.ts` is the abstract base class all endpoint classes extend (`IBaseRoute<TRequest, TResponse, TEnv>`; validates via `validateRequestInput`, maps `ServiceError` to the `{ Exception: { Type, Message } }` envelope).
- `apps/api/src/middleware/` — `MiddlewareHandlers` (`adminAuthentication()` middleware, `requireAdmin()` guard).
- Domain logic lives in packages: Web Crypto (cert/CRL verify, admin auth, URI normalise + SHA-1) in `packages/backend-services/src/auth/`; D1 access in `packages/backend-data/src/dao/`; domain types in `packages/shared/src/model/` (`TrackerNodeRecord`, `PublicTrackerNodeRecord`, `NodeInfo`, `HeartbeatBody`, `Certificate`).
- v5.0 stable-base liveness is on-demand from stored node `last_seen`/`status` (`StableBaseService`); the Worker does not actively ping nodes.
- `apps/api/src/generated/spa-shell.ts` — auto-generated SPA shell stub (produced by `postinstall`).
- `apps/web/` contains the Vite React SPA dashboard.
- `migrations/` contains D1 migrations.
- `test/` contains Vitest suites.

## Endpoint File Routing

Endpoint files mirror the URL path; the filename is the HTTP method in uppercase:

```
src/endpoints/tracker/health/GET.ts                  → GET /tracker/health
src/endpoints/tracker/stats/GET.ts                   → GET /tracker/stats
src/endpoints/tracker/nodes/GET.ts                   → GET /tracker/nodes
src/endpoints/tracker/nodes/POST.ts                  → POST /tracker/nodes
src/endpoints/tracker/nodes/seeds/GET.ts             → GET /tracker/nodes/seeds
src/endpoints/tracker/nodes/[node_id]/GET.ts         → GET /tracker/nodes/:node_id
src/endpoints/tracker/nodes/[node_id]/DELETE.ts      → DELETE /tracker/nodes/:node_id
src/endpoints/tracker/nodes/[node_id]/heartbeat/POST.ts → POST /tracker/nodes/:node_id/heartbeat
src/endpoints/tracker/crl/GET.ts                     → GET /tracker/crl
src/endpoints/tracker/crl/POST.ts                    → POST /tracker/crl
src/endpoints/tracker/regions/GET.ts                 → GET /tracker/regions
src/endpoints/tracker/geo/GET.ts                     → GET /tracker/geo
src/endpoints/tracker/admin/verify/GET.ts            → GET /tracker/admin/verify
src/endpoints/tracker/policy/GET.ts                  → GET /tracker/policy
src/endpoints/tracker/stable_base/GET.ts             → GET /tracker/stable_base
```

Each endpoint file exports a single class extending `IBaseRoute<TRequest, TResponse, TEnv>`. The worker registers the class directly (`openapi.get(path, RouteClass)`); `handleRequest(request, env, ctx)` returns a plain object (or `ExtendedResponse` for raw bodies/headers).

## API Routes

- `GET /tracker/health` — Worker uptime and status
- `GET /tracker/stats` — Ring-level aggregate statistics
- `POST /tracker/nodes` — Register a node (anchor or vnode); v4.0: accepts optional `vnodes[]` array in body and `anchor_id`/`vnode_proof` for individual vnode registration; validates VNodeProof signatures
- `GET /tracker/policy` — Return vnode policy (`max_vnodes_per_anchor`, `min_anchor_ratio`)
- `GET /tracker/stable_base` — Return configured stable-base member liveness, degraded status, and emergency threshold; uses `STABLE_BASE_MEMBERS`, `STABLE_BASE_MIN_SIZE`, and `STALE_THRESHOLD_SECONDS`
- `GET /tracker/nodes` — List all nodes (paginated, optional status/region filter); full data requires admin token
- `GET /tracker/nodes/seeds` — Get random seed nodes for bootstrapping
- `GET /tracker/nodes/:node_id` — Get a specific node record
- `DELETE /tracker/nodes/:node_id` — Deregister a node
- `POST /tracker/nodes/:node_id/heartbeat` — Update node liveness and ring state
- `GET /tracker/crl` — Fetch the current Certificate Revocation List (v2.0)
- `POST /tracker/crl` — Upload a new CA-signed CRL (v2.0)
- `GET /tracker/regions` — List known regions and node counts (v3.0)
- `GET /tracker/geo` — Return request geolocation (`region`/`country` from Cloudflare, `cf-ipcountry` fallback)
- `GET /tracker/admin/verify` — Verify admin token validity

`GET /tracker/nodes` and `GET /tracker/nodes/:node_id` mask all fields except `node_id` for unauthenticated requests. Pass `Authorization: Bearer <ADMIN_SECRET>` to receive full records.

Errors use the `{ Exception: { Type, Message } }` envelope with the error's own status code (`BadRequest` 400, `Unauthorized` 401, `NotFound` 404, `Conflict` 409, `RateLimited` 429, `ServiceUnavailable` 503, `InternalServerError` 500).

## Node IDs

Node IDs must be 40-character lowercase hexadecimal strings (SHA-1 hash). The regex is `/^[0-9a-f]{40}$/`.

## Build And Runtime Notes

- The root package is `@chord-dht-tracker/monorepo` and uses pnpm workspaces.
- `apps/api/wrangler.template.jsonc` is the Worker config template. Keep bindings and generated types in sync.
- Current Worker bindings:
  - D1: `DB`
  - Rate limiter: `NODE_RATE_LIMITER` (10 req / 60 s per node ID)
  - Secrets Store: `CA_PUBLIC_KEY_BASE64` (Ed25519 CA public key, base64url), `ADMIN_SECRET` (shared admin token)
  - Vars: `MAX_NODES`, `STALE_THRESHOLD_SECONDS`, `MAX_VNODES_PER_ANCHOR`, `MIN_ANCHOR_RATIO`, `SERVE_SPA_FROM_WORKER`, `STABLE_BASE_MEMBERS`, `STABLE_BASE_MIN_SIZE`
- The web app (`apps/web/dist/`) is served as static assets via Cloudflare Workers Assets.
- Apply migrations with `pnpm run migrate:local` (local D1) or `pnpm run migrate:remote` (production D1).

## Index

| Area                                             | Guide                                                    |
| ------------------------------------------------ | -------------------------------------------------------- |
| API worker, auth, routes                         | `apps/api/AGENTS.md`                                     |
| Background worker, cron tasks                      | `apps/background/AGENTS.md`                              |
| Web SPA, dashboard                               | `apps/web/AGENTS.md`                                     |
| Error taxonomy                                   | `packages/backend-errors/AGENTS.md`                      |
| DI, config, bindings                             | `packages/backend-runtime/AGENTS.md`                     |
| Shared constants, models, schemas, utils         | `packages/shared/AGENTS.md`                              |
| Bindings, wrangler, env vars                     | `docs/agents/runtime/AGENTS.md`                          |
| DI composition, AppConfiguration, request scopes | `docs/agents/runtime/AGENTS.md` (§ Dependency injection) |
| Tests, thresholds, mock patterns                 | `docs/agents/testing/AGENTS.md`                          |

## Keeping AGENTS.md Current

Update the scoped sub-guide as part of any change that adds, removes, or renames (update this index only when adding a new guide or top-level feature):

- Routes → `apps/api/AGENTS.md`
- Cron tasks/phases → `apps/background/AGENTS.md` (`src/scheduled/`; `TaskRegistry.ts`, add tasks there, not in the worker)
- Web UI → `apps/web/AGENTS.md`
- Errors → `packages/backend-errors/AGENTS.md`
- DI, config, env vars, bindings → `docs/agents/runtime/AGENTS.md` + `packages/backend-runtime/AGENTS.md`
- Shared constants/models/schemas/utils → `packages/shared/AGENTS.md`
- Tests, thresholds, mocks → `docs/agents/testing/AGENTS.md`

## Git Commit Messages

- Use Conventional Commits with this subject format: `<TYPE>[optional scope]: <description>`.
- Write the type in uppercase, for example `FIX`, `FEAT`, `DOCS`, `STYLE`, `REFACTOR`, `TEST`, `BUILD`, `CHORE`, `CI`, or `PERF`.
- Write the optional scope in lowercase inside parentheses, for example `FEAT(api): Add Node Eviction`.
- Write the description as concise human-readable words with spaces, capitalizing the first letter of each word.
- When creating a commit from `main`, first switch to a new branch generated from the planned commit subject.
- Use lowercase slash-separated branch names: `type/description` or `type/scope/description`.
- Use Markdown for optional commit bodies, separated from the subject by a blank line.
- When creating a commit from `main`, first switch to a new branch generated from the planned commit subject.
- Use lowercase slash-separated branch names: `type/description` when there is no scope, or `type/scope/description` when there is a scope.
- Convert the description to kebab-case for the branch, for example `docs/latest-agents-context-reflection`, `docs/agents/document-commit-standard`, or `feat/bootstrap/bootstrap-jqanywhere-v0.1-framework`.
