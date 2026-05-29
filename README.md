# Chord DHT Tracker

A Cloudflare Worker that acts as the centralized bootstrap and health-monitoring component for a [Chord DHT](https://pdos.csail.mit.edu/papers/ton:chord/paper-ton.pdf) learning system. Chord nodes are fully peer-to-peer and do not depend on this Tracker for routing — the Tracker only provides seed discovery, global statistics, and optional certificate-based identity verification.

> **Learning system** — designed for studying the Chord protocol. Not intended for production use.

## Sister Project

[**ChordDHT**](https://github.com/Rexezuge-DockerUtils/ChordDHT) — the Go node implementation that joins a Chord ring and uses this Tracker for bootstrapping and heartbeats.

[**ChordDHT-Design**](https://github.com/Rexezuge-Gists/ChordDHT-Design) — design documentation for the ChordDHT system.

## Architecture

```
          ┌──────────────────────────────────────┐
          │         Chord DHT Tracker            │
          │  (this repo — Cloudflare Worker)     │
          │                                      │
          │  POST /tracker/nodes      register   │
          │  GET  /tracker/nodes/seeds  seeds    │
          │  POST /tracker/nodes/:id/heartbeat   │
          │  GET  /tracker/crl        revocation │
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
| Successor list length | `r = 5` (v3.0) | Tolerates up to 4 consecutive node failures |
| Maintenance interval | 15 s active / 60 s quiet | Adaptive per topology activity |
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
| `POST` | `/tracker/nodes` | Register a node (optionally includes v2.0 certificate) |
| `GET` | `/tracker/nodes` | List all known nodes (paginated) |
| `GET` | `/tracker/nodes/seeds` | Fetch random bootstrap seeds |
| `GET` | `/tracker/nodes/:node_id` | Get a specific node record |
| `DELETE` | `/tracker/nodes/:node_id` | Deregister a node (graceful leave) |
| `POST` | `/tracker/nodes/:node_id/heartbeat` | Report node liveness and ring state |
| `GET` | `/tracker/crl` | Fetch the current Certificate Revocation List (v2.0) |
| `POST` | `/tracker/crl` | Upload a new CA-signed CRL (v2.0) |
| `GET` | `/tracker/regions` | List known regions and node counts (v3.0) |

`GET /tracker/nodes` also accepts a `?region=<label>` query parameter (v3.0) to filter by region.

### Key request/response shapes

**Register — `POST /tracker/nodes`**
```json
{
  "node_id": "<40-hex>",
  "uri": "https://node1.example.com",
  "certificate": { "...": "optional; verified against CA_PUBLIC_KEY_BASE64 when configured" }
}
```

**Seeds — `GET /tracker/nodes/seeds?count=5&exclude=<node_id>&include_cert=true`**
```json
{
  "seeds": [
    {
      "node_id": "...",
      "uri": "https://node2.example.com",
      "certificate": { "...": "included when ?include_cert=true and cert is stored" }
    }
  ],
  "total_known": 15,
  "note": "Nodes selected randomly from active list"
}
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
  "maintenance_cycles": 60,
  "cert_expires_at": 1779926400
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
  "expiring_cert_nodes": 2,
  "tracker_uptime_seconds": 7200,
  "stats_generated_at": "2026-05-28T12:00:00Z"
}
```

`expiring_cert_nodes` counts nodes whose `cert_expires_at` is within the next 30 days.

Nodes not seen within `STALE_THRESHOLD_SECONDS` (default 180 s) are counted as `stale_nodes`. The Tracker never probes nodes actively; it relies entirely on heartbeat reports.

**CRL — `GET /tracker/crl`**
```json
{
  "version": 1,
  "updated_at": 1748390400,
  "revoked_node_ids": ["a94a8fe5ccb19ba61c4c0873d391e987982fbbd3"],
  "signature": "<base64url CA Ed25519 signature>"
}
```

**Upload CRL — `POST /tracker/crl`**

Send the same CRL JSON object. The tracker verifies the CA signature and rejects uploads with a version number not strictly greater than the current stored version.

### Error format

```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable description", "detail": {} } }
```

Common codes: `INVALID_REQUEST` (400), `INVALID_CERTIFICATE` (400), `NODE_NOT_FOUND` (404), `ID_COLLISION` (409), `RATE_LIMITED` (429), `NOT_FOUND` (404, CRL not yet uploaded).

## Authentication (v2.0)

Node certificate verification is **opt-in** and controlled by the `CA_PUBLIC_KEY_BASE64` environment variable.

### How It Works

When `CA_PUBLIC_KEY_BASE64` is set:

- **`POST /tracker/nodes`** — if a `certificate` field is present in the body, it is verified against the CA public key (signature, validity period, URI/node_id consistency). Only nodes with valid certificates are registered. Their `cert_expires_at` is stored for expiry monitoring.
- **`GET /tracker/nodes/seeds?include_cert=true`** — returns each seed's stored certificate so joining nodes can pre-warm their cert cache before making peer-to-peer calls.
- **`GET /tracker/stats`** — reports `expiring_cert_nodes` (certificates expiring within 30 days).
- **`GET /tracker/crl`** — nodes poll this every maintenance cycle to pick up revocations.
- **`POST /tracker/crl`** — CA operator uploads a signed CRL; the tracker stores it after verifying the CA signature.

If `CA_PUBLIC_KEY_BASE64` is absent or empty, certificate fields are silently ignored and all existing v1.0 behaviour is preserved.

### Certificate Format (v2.0)

```json
{
  "version":    1,
  "node_id":    "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3",
  "uri":        "https://node1.example.com",
  "public_key": "<base64url 32-byte Ed25519 public key>",
  "issued_at":  1748390400,
  "expires_at": 1779926400,
  "signature":  "<base64url 64-byte CA Ed25519 signature>"
}
```

`node_id` must equal `SHA-1(normalized_uri)` — the tracker enforces this. Verification uses the Web Crypto API (`crypto.subtle.verify` with `Ed25519`).

### Setting the CA Public Key

```sh
# Use wrangler secrets (recommended — not stored in wrangler.jsonc)
wrangler secret put CA_PUBLIC_KEY_BASE64
# Paste the base64url-encoded 32-byte CA Ed25519 public key when prompted

# Or for local dev, set in .dev.vars:
CA_PUBLIC_KEY_BASE64=<base64url-32-bytes>
```

## Dashboard

A Vite + React SPA (`apps/web/`) is deployed as Cloudflare Pages and shows:

- **Stats panel** — active/isolated/stale node counts, average finger table coverage, and expiring cert count
- **Ring visualization** — SVG circle plot of all nodes positioned by their SHA-1 ID angle, color-coded by status
- **Node table** — sortable list with successor/predecessor IDs, uptime, and last-seen time

The dashboard polls `GET /tracker/nodes` and `GET /tracker/stats` every 5 seconds.

## Project Layout

```
apps/
  api/                         Cloudflare Worker (Tracker API)
    src/
      index.ts                 Worker entry point
      auth.ts                  Web Crypto helpers: cert verify, CRL verify, URI normalise + SHA-1 hash
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
        tracker/crl/GET.ts
        tracker/crl/POST.ts
      db.ts                    D1 access helpers, config reads, CA key import/cache
      errors.ts                errorResponse helper
      types.ts                 TrackerNodeRecord, NodeInfo, HeartbeatBody, Certificate
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
migrations/
  0001_initial.sql             Nodes and tracker_meta tables
  0002_auth.sql                cert_json, cert_expires_at columns; crl table
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

Copy `apps/api/wrangler.template.jsonc` to `wrangler.jsonc` and fill in your D1 `database_id` before deploying. Apply migrations with `pnpm run migrate:local` (local) or `pnpm run migrate:remote` (production).

**Environment variables (Worker `vars`):**

| Var | Default | Description |
|-----|---------|-------------|
| `MAX_NODES` | `1000` | Maximum nodes stored; evicts oldest by `last_seen` when exceeded |
| `STALE_THRESHOLD_SECONDS` | `180` | Seconds without a heartbeat before a node is counted as stale |
| `SERVE_SPA_FROM_WORKER` | `false` | Set to `true` to serve the SPA from the Worker instead of Pages |
| `CA_PUBLIC_KEY_BASE64` | *(none)* | CA Ed25519 public key (base64url, 32 bytes); enables v2.0 cert verification when set. Use `wrangler secret put`. |

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
7. **Certificate rotation** — issue a new cert without restarting the node; observe CRL propagation across the ring

## License

MIT
