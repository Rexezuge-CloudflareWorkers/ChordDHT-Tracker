# AGENTS.md

Guidance for agents working in ChordDHT-Tracker.

## Overview

ChordDHT-Tracker is a Cloudflare Worker API that tracks nodes in a Chord DHT (Distributed Hash Table) ring, with a Vite React management UI in a pnpm workspace. The API provides endpoints for node registration, heartbeats, seed discovery, and ring statistics.

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

```bash
pnpm install
pnpm run dev
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run lint
pnpm run deploy
pnpm run typegen
```

Cloudflare command equivalents:

| Command                         | Purpose                   |
| ------------------------------- | ------------------------- |
| `npx wrangler dev`              | Local Worker development  |
| `npx wrangler deploy`           | Deploy to Cloudflare      |
| `npx wrangler types`            | Generate TypeScript types |

Run `pnpm run typegen` after changing bindings in Wrangler config.

## Architecture

- `apps/api/src/index.ts` exports the default Cloudflare Worker fetch handler using `ChordDHTTrackerWorker`.
- `apps/api/src/workers/ChordDHTTrackerWorker.ts` registers Hono routes from file-routed endpoint classes.
- `apps/api/src/endpoints/` contains file-routed endpoint classes, one file per HTTP method per route.
- `apps/api/src/endpoints/IBaseRoute.ts` is the abstract base class all endpoint classes extend.
- `apps/api/src/auth.ts` — Web Crypto helpers: cert verify, CRL verify, admin token auth, URI normalise + SHA-1 hash.
- `apps/api/src/db.ts` owns D1 access helpers (config reads, CA key import/cache, tracker_meta management).
- `apps/api/src/errors.ts` provides the `errorResponse` helper for structured error responses.
- `apps/api/src/types.ts` contains domain types (`TrackerNodeRecord`, `PublicTrackerNodeRecord`, `NodeInfo`, `HeartbeatBody`, `Certificate`, `sanitizeNode`).
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
src/endpoints/tracker/admin/verify/GET.ts            → GET /tracker/admin/verify
```

Each endpoint file exports a single class extending `IBaseRoute`. The worker instantiates the class and calls `.handle(c)` as the Hono handler.

## API Routes

- `GET /tracker/health` — Worker uptime and status
- `GET /tracker/stats` — Ring-level aggregate statistics
- `POST /tracker/nodes` — Register a new node
- `GET /tracker/nodes` — List all nodes (paginated, optional status/region filter); full data requires admin token
- `GET /tracker/nodes/seeds` — Get random seed nodes for bootstrapping
- `GET /tracker/nodes/:node_id` — Get a specific node record
- `DELETE /tracker/nodes/:node_id` — Deregister a node
- `POST /tracker/nodes/:node_id/heartbeat` — Update node liveness and ring state
- `GET /tracker/crl` — Fetch the current Certificate Revocation List (v2.0)
- `POST /tracker/crl` — Upload a new CA-signed CRL (v2.0)
- `GET /tracker/regions` — List known regions and node counts (v3.0); requires admin token
- `GET /tracker/admin/verify` — Verify admin token validity

`GET /tracker/nodes` and `GET /tracker/nodes/:node_id` mask all fields except `node_id` for unauthenticated requests. Pass `Authorization: Bearer <ADMIN_SECRET>` to receive full records.

## Node IDs

Node IDs must be 40-character lowercase hexadecimal strings (SHA-1 hash). The regex is `/^[0-9a-f]{40}$/`.

## Build And Runtime Notes

- The root package is `@chord-dht-tracker/monorepo` and uses pnpm workspaces.
- `apps/api/wrangler.template.jsonc` is the Worker config template. Keep bindings and generated types in sync.
- Current Worker bindings:
  - D1: `DB`
  - Rate limiter: `NODE_RATE_LIMITER` (10 req / 60 s per node ID)
  - Secrets Store: `CA_PUBLIC_KEY_BASE64` (Ed25519 CA public key, base64url), `ADMIN_SECRET` (shared admin token)
  - Vars: `MAX_NODES`, `STALE_THRESHOLD_SECONDS`, `SERVE_SPA_FROM_WORKER`
- The web app (`apps/web/dist/`) is served as static assets via Cloudflare Workers Assets.
- Apply migrations with `pnpm run migrate:local` (local D1) or `pnpm run migrate:remote` (production D1).

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
