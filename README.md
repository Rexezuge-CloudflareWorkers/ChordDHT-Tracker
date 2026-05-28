# Chord DHT Tracker

A Cloudflare Worker that acts as the centralized bootstrap and health-monitoring component for a [Chord DHT](https://pdos.csail.mit.edu/papers/ton:chord/paper-ton.pdf) learning system. Chord nodes are fully peer-to-peer and do not depend on this Tracker for routing — the Tracker only provides seed discovery and global statistics.

> **Learning system** — designed for studying the Chord protocol. Not suitable for production use: no TLS between nodes, no authentication, no NAT traversal.

## Sister Project

[**ChordDHT**](https://github.com/Rexezuge-DockerUtils/ChordDHT) — the Go node implementation that joins a Chord ring and uses this Tracker for bootstrapping and heartbeats.

## Architecture

```
          ┌──────────────────────────────────────┐
          │         Chord DHT Tracker            │
          │  (this repo — Cloudflare Worker)     │
          │                                      │
          │  POST /tracker/nodes      register   │
          │  GET  /tracker/nodes/seeds  seeds    │
          │  POST /tracker/nodes/:id/heartbeat   │
          │  GET  /tracker/stats      dashboard  │
          │  GET  /tracker/health     liveness   │
          └──────────────────────────────────────┘
                    ▲ optional bootstrap only
        ┌───────────┼───────────────────────────┐
        │           │                           │
   ┌────┴────┐ ┌────┴────┐               ┌─────┴────┐
   │ Node A  │ │ Node B  │  · · ·        │ Node N   │
   └─────────┘ └─────────┘               └──────────┘
        └────────────── P2P HTTP ─────────────────┘
          find_successor / notify / stabilize / …
```

The Tracker stores a registry of known nodes and serves random seed lists for new nodes to bootstrap. Once a node has joined the ring, all routing happens peer-to-peer; the Tracker going offline has zero effect on an established ring.

## Chord Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| ID space | `m = 160` | SHA-1, matches the original Chord paper |
| Successor list length | `r = 3` | Tolerates up to 3 consecutive node failures |
| Maintenance interval | 60 s | `check_predecessor → stabilize → fix_fingers` |
| Max routing hops | 161 (`m + 1`) | Hard limit per `find_successor` iteration |
| Expected routing cost | O(log N) hops | Guaranteed by finger table |

**Node ID formula:** `SHA-1` of the node's canonical HTTPS URI (lowercase scheme + host, no trailing slash, non-443 port retained). Example: `SHA-1("https://node1.example.com")` → `a94a8fe5ccb19ba61c4c0873d391e987982fbbd3`.

## Node Lifecycle

```
INITIALIZING → JOINING → ACTIVE ──→ LEAVING → (exit)
                   │         │
                   └────┐    └──→ ISOLATED ──→ JOINING (rejoin)
                        │
                 (no seeds: single-node ring → ACTIVE)
```

- **ACTIVE** nodes respond to all API calls and run periodic maintenance.
- **ISOLATED** nodes respond only to `GET /chord/ping` and `GET /chord/identity` while attempting to rejoin via the Tracker.
- **LEAVING** nodes return `503 NODE_LEAVING` to routing requests while notifying their neighbors.

## Tracker API

All requests and responses use `Content-Type: application/json`. Node IDs are 40-character lowercase hex strings.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/tracker/health` | Tracker liveness check |
| `GET` | `/tracker/stats` | Global ring health summary |
| `POST` | `/tracker/nodes` | Register a node |
| `GET` | `/tracker/nodes` | List all known nodes (paginated) |
| `GET` | `/tracker/nodes/seeds` | Fetch random bootstrap seeds |
| `GET` | `/tracker/nodes/:node_id` | Get a specific node record |
| `DELETE` | `/tracker/nodes/:node_id` | Deregister a node (graceful leave) |
| `POST` | `/tracker/nodes/:node_id/heartbeat` | Report node liveness and ring state |

### Key request/response shapes

**Register — `POST /tracker/nodes`**
```json
{ "node_id": "<40-hex>", "uri": "https://node1.example.com" }
```

**Seeds — `GET /tracker/nodes/seeds?count=5&exclude=<node_id>`**
```json
{ "seeds": [{ "node_id": "...", "uri": "https://…" }], "total_known": 15 }
```

**Heartbeat — `POST /tracker/nodes/:node_id/heartbeat`**
```json
{
  "status": "ACTIVE",
  "successor_id": "<40-hex>",
  "predecessor_id": "<40-hex>",
  "successor_list_size": 3,
  "finger_table_coverage": 0.85,
  "uptime_seconds": 3600,
  "maintenance_cycles": 60
}
```

**Stats — `GET /tracker/stats`**
```json
{
  "total_nodes": 15,
  "active_nodes": 13,
  "isolated_nodes": 1,
  "leaving_nodes": 1,
  "stale_nodes": 2,
  "avg_finger_table_coverage": 0.82,
  "avg_uptime_seconds": 1800,
  "tracker_uptime_seconds": 7200
}
```

Nodes not seen within `STALE_THRESHOLD_SECONDS` (default 180 s) are counted as `stale_nodes`. The Tracker never probes nodes actively; it relies entirely on heartbeat reports.

### Error format

```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable description", "detail": {} } }
```

Common codes: `INVALID_REQUEST` (400), `NODE_NOT_FOUND` (404), `ID_COLLISION` (409), `NODE_ISOLATED` / `MAX_HOPS_EXCEEDED` / `NODE_LEAVING` (503).

## Dashboard

A Vite + React SPA (`apps/web/`) is deployed as Cloudflare Pages and shows:

- **Stats panel** — active/isolated/stale node counts and average finger table coverage
- **Ring visualization** — SVG circle plot of all nodes positioned by their SHA-1 ID angle, color-coded by status
- **Node table** — sortable list with successor/predecessor IDs, uptime, and last-seen time

The dashboard polls `GET /tracker/nodes` and `GET /tracker/stats` every 5 seconds.

## Project Layout

```
apps/
  api/                         Cloudflare Worker (Tracker API)
    src/
      index.ts                 Worker entry point
      workers/
        ChordDHTTrackerWorker.ts  Hono app + route registration
      endpoints/               File-routed handlers (one file = one HTTP method)
        tracker/health/GET.ts
        tracker/stats/GET.ts
        tracker/nodes/GET.ts
        tracker/nodes/POST.ts
        tracker/nodes/seeds/GET.ts
        tracker/nodes/[node_id]/GET.ts
        tracker/nodes/[node_id]/DELETE.ts
        tracker/nodes/[node_id]/heartbeat/POST.ts
      db.ts                    D1 access helpers and config reads
      errors.ts                errorResponse helper
      types.ts                 TrackerNodeRecord, NodeInfo, HeartbeatBody
      env.d.ts                 Cloudflare env type declarations
    wrangler.template.jsonc    Worker config template
  web/                         Vite React dashboard (Cloudflare Pages)
    src/
      SpaApp.tsx               Root component
      components/
        RingVisualization.tsx  SVG ring diagram
        NodeTable.tsx          Node list
        StatsPanel.tsx         Aggregate metrics
      api.ts                   Tracker API client
      types.ts                 Shared frontend types
migrations/                    D1 schema migrations
test/                          Vitest suites
```

## Development

**Prerequisites:** Node.js, pnpm, a Cloudflare account with D1 and Workers enabled.

```bash
pnpm install
pnpm run typegen        # generate TypeScript types from wrangler bindings
pnpm run dev            # start local Worker dev server
pnpm run typecheck      # TypeScript type-check
pnpm run test           # run Vitest suite
pnpm run lint           # ESLint
pnpm run build          # production build
pnpm run deploy         # deploy Worker + Pages to Cloudflare
```

Copy `apps/api/wrangler.template.jsonc` to `wrangler.jsonc` and fill in your D1 `database_id` before deploying.

**Environment variables (Worker `vars`):**

| Var | Default | Description |
|-----|---------|-------------|
| `MAX_NODES` | `1000` | Maximum nodes stored; evicts oldest by `last_seen` when exceeded |
| `STALE_THRESHOLD_SECONDS` | `180` | Seconds without a heartbeat before a node is counted as stale |
| `SERVE_SPA_FROM_WORKER` | `false` | Set to `true` to serve the SPA from the Worker instead of Pages |

## Chord Protocol Summary

This Tracker supports nodes that implement the Chord protocol as described in [Stoica et al., ACM SIGCOMM 2001](https://pdos.csail.mit.edu/papers/ton:chord/paper-ton.pdf). The expected Node API surface (implemented by each DHT node, not this Tracker) is:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/chord/identity` | Node identity (responds even when ISOLATED) |
| `GET` | `/chord/state` | Full Chord state: finger table, successor list, predecessor |
| `GET` | `/chord/ping` | Liveness probe (5 s timeout, responds even when ISOLATED) |
| `POST` | `/chord/find_successor` | Iterative successor lookup (returns `found`/`next_hop`) |
| `GET` | `/chord/predecessor` | Returns current predecessor or `null` |
| `POST` | `/chord/notify` | Stabilize: "I might be your predecessor" |
| `GET` | `/chord/successor_list` | Returns `r = 3` successor entries |
| `POST` | `/chord/join` | Bootstrap entry point; internally calls `find_successor` |
| `POST` | `/chord/leave` | Graceful leave notification to a neighbor |
| `GET` | `/chord/finger_table` | Full 160-entry finger table (debug) |

`find_successor` uses **iterative** (not recursive) mode: a node returns `next_hop` to the caller, which drives the hop loop itself. HTTP call depth is always 1, not O(log N).

## Learning Extensions

Suggested experiments after implementing the base protocol:

1. **Ring visualizer** — already built in this repo's dashboard
2. **Finger table validator** — verify each `finger[i].node` is the true Chord successor of `finger[i].start`
3. **Crash & recovery observation** — kill a node and watch the ~2-minute self-healing sequence
4. **Adjust `r`** — raise successor list size to 5 or 10; simulate killing 4 consecutive nodes
5. **Add KV storage** — implement `PUT /data/{key}` and `GET /data/{key}` routed to the responsible node
6. **Route tracing** — add `trace_id` to `find_successor` and collect per-hop latency; verify O(log N) empirically

## License

MIT
