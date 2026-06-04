import { importEd25519PublicKey } from '@/auth';
import type { TrackerNodeRecord, VNodeProof, VNodeEntry } from '@/types';
export type { VNodeEntry };

export type D1Queryable = Pick<D1Database, 'prepare' | 'batch'>;

const encoder = new TextEncoder();

// Parse JSON TEXT columns that are stored as serialized strings in D1.
export function parseNodeJsonColumns(node: TrackerNodeRecord): TrackerNodeRecord {
  return {
    ...node,
    successor_list: parseJSONColumn(node.successor_list),
    predecessor_list: parseJSONColumn(node.predecessor_list),
    rtt_samples: parseJSONColumn(node.rtt_samples),
    finger_nodes: parseJSONColumn(node.finger_nodes),
  };
}

function parseJSONColumn<T>(value: string | T | null): T | null {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  return JSON.parse(value) as T;
}

function unixSecondsToISO(value: number | null | undefined, fallback: string): string {
  if (typeof value !== 'number') return fallback;
  return new Date(value * 1000).toISOString();
}

// Module-level cache: survives within a Worker isolate lifetime.
let cachedCAKey: CryptoKey | null = null;
let cachedCAKeyBase64: string | null = null;

// getCAPublicKey imports and caches the CA Ed25519 public key from the Secrets Store.
// Returns null if the secret is absent, unconfigured (placeholder), or not a valid Ed25519 key.
export async function getCAPublicKey(env: Env): Promise<CryptoKey | null> {
  try {
    const b64 = await env.CA_PUBLIC_KEY_BASE64.get();
    if (!b64) return null;
    if (cachedCAKey && cachedCAKeyBase64 === b64) return cachedCAKey;
    cachedCAKey = await importEd25519PublicKey(b64);
    cachedCAKeyBase64 = b64;
    return cachedCAKey;
  } catch {
    return null;
  }
}

export function getMaxNodes(env: Env): number {
  return parseInt(env.MAX_NODES, 10);
}

export function getStaleThresholdSecs(env: Env): number {
  return parseInt(env.STALE_THRESHOLD_SECONDS, 10);
}

export async function getStartedAt(db: D1Queryable, now: string): Promise<string> {
  await db.prepare("INSERT OR IGNORE INTO tracker_meta (key, value) VALUES ('started_at', ?)").bind(now).run();
  const row = await db.prepare("SELECT value FROM tracker_meta WHERE key = 'started_at'").first<{ value: string }>();
  return row!.value;
}

export function getServeSpaFromWorker(env: Env): boolean {
  return (env.SERVE_SPA_FROM_WORKER as string) === 'true';
}

export async function evictOverLimit(db: D1Queryable, maxNodes: number): Promise<void> {
  const countResult = await db.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();
  const count = countResult?.count ?? 0;
  if (count <= maxNodes) return;
  const excess = count - maxNodes;
  await db
    .prepare('DELETE FROM nodes WHERE node_id IN (SELECT node_id FROM nodes ORDER BY last_seen ASC LIMIT ?)')
    .bind(excess)
    .run();
}

// ---------- v4.0 vnode helpers ----------

// base64StdDecode decodes standard base64 (with padding, +/ chars) to ArrayBuffer.
function base64StdDecode(s: string): ArrayBuffer {
  const binary = atob(s);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

// deriveVNodeID computes SHA1("chord-vnode-v4\n" + anchorID + "\n" + index), matching Go.
export async function deriveVNodeID(anchorID: string, index: number): Promise<string> {
  const input = `chord-vnode-v4\n${anchorID}\n${index}`;
  const hashBuf = await crypto.subtle.digest('SHA-1', encoder.encode(input));
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// verifyVNodeProof verifies a VNodeProof against the anchor's Ed25519 public key.
// anchorPubBase64 is the anchor's public key in standard base64 (from the CA certificate's
// public_key field, which is base64url — caller must normalise before passing).
export async function verifyVNodeProof(proof: VNodeProof, anchorPubBase64Url: string): Promise<boolean> {
  // anchorPubBase64Url is base64url raw; convert to raw 32-byte key.
  const padded = anchorPubBase64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(padLen);
  const pubKeyBuf = base64StdDecode(b64);
  if (pubKeyBuf.byteLength !== 32) return false;

  const key = await crypto.subtle.importKey('raw', pubKeyBuf, { name: 'Ed25519' }, false, ['verify']);

  // Check expiry.
  const now = Math.floor(Date.now() / 1000);
  if (proof.expires_at < now) return false;

  // Recompute expected vnode_id.
  const expected = await deriveVNodeID(proof.anchor_id, proof.index);
  if (expected !== proof.vnode_id) return false;

  // Verify Ed25519 signature over canonical form.
  const canonical = `chord-vnode-proof-v4\n${proof.vnode_id}\n${proof.anchor_id}\n${proof.index}\n${proof.issued_at}\n${proof.expires_at}`;
  const sigBuf = base64StdDecode(proof.signature);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, sigBuf, encoder.encode(canonical));
}

// upsertVNode inserts or updates a vnode record in the vnodes table.
export async function upsertVNode(db: D1Queryable, entry: {
  vnode_id: string;
  anchor_id: string;
  vnode_index: number;
  proof_json: string;
  now: number;
}): Promise<void> {
  await db.prepare(
    `INSERT INTO vnodes (vnode_id, anchor_id, vnode_index, proof_json, status, last_seen, joined_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
     ON CONFLICT(vnode_id) DO UPDATE SET
       anchor_id = excluded.anchor_id,
       vnode_index = excluded.vnode_index,
       proof_json = excluded.proof_json,
       status = 'ACTIVE',
       last_seen = excluded.last_seen`,
  ).bind(entry.vnode_id, entry.anchor_id, entry.vnode_index, entry.proof_json, entry.now, entry.now).run();
}

// deleteVNodesByAnchor removes all vnode records for the given anchor.
export async function deleteVNodesByAnchor(db: D1Queryable, anchorID: string): Promise<void> {
  await db.prepare('DELETE FROM vnodes WHERE anchor_id = ?').bind(anchorID).run();
}

// getVNodesByAnchor returns all registered vnodes for the given anchor.
export async function getVNodesByAnchor(db: D1Queryable, anchorID: string): Promise<VNodeEntry[]> {
  const { results } = await db.prepare(
    'SELECT vnode_id, vnode_index, status FROM vnodes WHERE anchor_id = ? ORDER BY vnode_index',
  ).bind(anchorID).all<{ vnode_id: string; vnode_index: number; status: string }>();
  return results.map(r => ({ vnode_id: r.vnode_id, index: r.vnode_index, status: r.status }));
}

interface LogicalVNodeRow {
  vnode_id: string;
  anchor_id: string;
  vnode_index: number;
  status: string;
  last_seen: number;
  joined_at: number | null;
  report_count: number | null;
  successor_id: string | null;
  predecessor_id: string | null;
  successor_list_size: number | null;
  successor_list_capacity: number | null;
  finger_table_coverage: number | null;
  uptime_seconds: number | null;
  maintenance_cycles: number | null;
  maintenance_mode: string | null;
  cache_hits: number | null;
  cache_misses: number | null;
  cache_size: number | null;
  predecessor_list_size: number | null;
  successor_list: string | null;
  predecessor_list: string | null;
  rtt_samples: string | null;
  finger_nodes: string | null;
  anchor_uri: string;
  anchor_joined_at: string;
  anchor_last_seen: string;
  anchor_region: string | null;
}

function logicalVNodeFromRow(row: LogicalVNodeRow): TrackerNodeRecord {
  return parseNodeJsonColumns({
    node_id: row.vnode_id,
    vnode_count: 0,
    is_vnode: true,
    anchor_id: row.anchor_id,
    vnode_index: row.vnode_index,
    uri: row.anchor_uri,
    status: row.status,
    joined_at: unixSecondsToISO(row.joined_at, row.anchor_joined_at),
    last_seen: unixSecondsToISO(row.last_seen, row.anchor_last_seen),
    report_count: row.report_count ?? 0,
    successor_id: row.successor_id,
    predecessor_id: row.predecessor_id,
    successor_list_size: row.successor_list_size,
    successor_list_capacity: row.successor_list_capacity,
    finger_table_coverage: row.finger_table_coverage,
    uptime_seconds: row.uptime_seconds,
    maintenance_cycles: row.maintenance_cycles,
    cert_json: null,
    cert_expires_at: null,
    region: row.anchor_region,
    maintenance_mode: row.maintenance_mode,
    cache_hits: row.cache_hits,
    cache_misses: row.cache_misses,
    cache_size: row.cache_size,
    predecessor_list_size: row.predecessor_list_size,
    successor_list: row.successor_list,
    predecessor_list: row.predecessor_list,
    rtt_samples: row.rtt_samples,
    finger_nodes: row.finger_nodes,
  });
}

const logicalVNodeSelect = `
  SELECT
    v.vnode_id,
    v.anchor_id,
    v.vnode_index,
    v.status,
    v.last_seen,
    v.joined_at,
    v.report_count,
    v.successor_id,
    v.predecessor_id,
    v.successor_list_size,
    v.successor_list_capacity,
    v.finger_table_coverage,
    v.uptime_seconds,
    v.maintenance_cycles,
    v.maintenance_mode,
    v.cache_hits,
    v.cache_misses,
    v.cache_size,
    v.predecessor_list_size,
    v.successor_list,
    v.predecessor_list,
    v.rtt_samples,
    v.finger_nodes,
    a.uri AS anchor_uri,
    a.joined_at AS anchor_joined_at,
    a.last_seen AS anchor_last_seen,
    a.region AS anchor_region
  FROM vnodes v
  INNER JOIN nodes a ON a.node_id = v.anchor_id`;

export async function getLogicalVNodesByAnchors(db: D1Queryable, anchorIDs: string[]): Promise<TrackerNodeRecord[]> {
  if (anchorIDs.length === 0) return [];
  const out: TrackerNodeRecord[] = [];
  const chunkSize = 90;
  for (let i = 0; i < anchorIDs.length; i += chunkSize) {
    const chunk = anchorIDs.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(', ');
    const { results } = await db.prepare(
      `${logicalVNodeSelect}
       WHERE v.anchor_id IN (${placeholders})
       ORDER BY v.last_seen DESC`,
    ).bind(...chunk).all<LogicalVNodeRow>();
    out.push(...results.map(logicalVNodeFromRow));
  }
  return out;
}

export async function getLogicalVNodeByID(db: D1Queryable, vnodeID: string): Promise<TrackerNodeRecord | null> {
  const row = await db.prepare(
    `${logicalVNodeSelect}
     WHERE v.vnode_id = ?`,
  ).bind(vnodeID).first<LogicalVNodeRow>();
  return row ? logicalVNodeFromRow(row) : null;
}

// checkVNodeIDCollision returns true if the given vnode_id is already registered.
export async function checkVNodeIDCollision(db: D1Queryable, vnodeID: string, anchorID: string): Promise<boolean> {
  // Collides if another anchor owns this vnode_id or if it matches an existing anchor node_id.
  const vnodeRow = await db.prepare(
    'SELECT vnode_id FROM vnodes WHERE vnode_id = ? AND anchor_id != ?',
  ).bind(vnodeID, anchorID).first();
  if (vnodeRow) return true;
  const nodeRow = await db.prepare('SELECT node_id FROM nodes WHERE node_id = ?').bind(vnodeID).first();
  return !!nodeRow;
}

// updateAnchorVnodeCount updates the vnode_count column on the anchor row.
export async function updateAnchorVnodeCount(db: D1Queryable, anchorID: string, count: number): Promise<void> {
  await db.prepare('UPDATE nodes SET vnode_count = ? WHERE node_id = ?').bind(count, anchorID).run();
}
