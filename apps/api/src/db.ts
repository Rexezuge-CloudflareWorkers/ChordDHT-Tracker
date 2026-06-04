import { importEd25519PublicKey } from '@/auth';
import type { TrackerNodeRecord, VNodeProof, VNodeEntry } from '@/types';
export type { VNodeEntry };

export type D1Queryable = Pick<D1Database, 'prepare' | 'batch'>;

const encoder = new TextEncoder();

// Parse JSON TEXT columns that are stored as serialized strings in D1.
export function parseNodeJsonColumns(node: TrackerNodeRecord): TrackerNodeRecord {
  return {
    ...node,
    successor_list: node.successor_list ? JSON.parse(node.successor_list as string) : null,
    predecessor_list: node.predecessor_list ? JSON.parse(node.predecessor_list as string) : null,
    rtt_samples: node.rtt_samples ? JSON.parse(node.rtt_samples as string) : null,
    finger_nodes: node.finger_nodes ? JSON.parse(node.finger_nodes as string) : null,
  };
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
    `INSERT INTO vnodes (vnode_id, anchor_id, vnode_index, proof_json, status, last_seen)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?)
     ON CONFLICT(vnode_id) DO UPDATE SET
       anchor_id = excluded.anchor_id,
       vnode_index = excluded.vnode_index,
       proof_json = excluded.proof_json,
       status = 'ACTIVE',
       last_seen = excluded.last_seen`,
  ).bind(entry.vnode_id, entry.anchor_id, entry.vnode_index, entry.proof_json, entry.now).run();
}

// deleteVNodesByAnchor removes all vnode records for the given anchor.
export async function deleteVNodesByAnchor(db: D1Queryable, anchorID: string): Promise<void> {
  await db.prepare('DELETE FROM vnodes WHERE anchor_id = ?').bind(anchorID).run();
}

// getVNodesByAnchor returns all active vnodes for the given anchor.
export async function getVNodesByAnchor(db: D1Queryable, anchorID: string): Promise<VNodeEntry[]> {
  const { results } = await db.prepare(
    'SELECT vnode_id, vnode_index FROM vnodes WHERE anchor_id = ? AND status = ? ORDER BY vnode_index',
  ).bind(anchorID, 'ACTIVE').all<{ vnode_id: string; vnode_index: number }>();
  return results.map(r => ({ vnode_id: r.vnode_id, index: r.vnode_index }));
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
