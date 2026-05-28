import { importEd25519PublicKey } from '@/auth';

// Module-level cache: survives within a Worker isolate lifetime.
let cachedCAKey: CryptoKey | null = null;
let cachedCAKeyBase64: string | null = null;

// getCAPublicKey imports and caches the CA Ed25519 public key from env.
export async function getCAPublicKey(env: Env): Promise<CryptoKey | null> {
  const b64 = (env as unknown as { CA_PUBLIC_KEY_BASE64?: string }).CA_PUBLIC_KEY_BASE64;
  if (!b64) return null;
  if (cachedCAKey && cachedCAKeyBase64 === b64) return cachedCAKey;
  cachedCAKey = await importEd25519PublicKey(b64);
  cachedCAKeyBase64 = b64;
  return cachedCAKey;
}

export function getMaxNodes(env: Env): number {
  return parseInt(env.MAX_NODES, 10);
}

export function getStaleThresholdSecs(env: Env): number {
  return parseInt(env.STALE_THRESHOLD_SECONDS, 10);
}

export async function getStartedAt(db: D1Database, now: string): Promise<string> {
  await db.prepare("INSERT OR IGNORE INTO tracker_meta (key, value) VALUES ('started_at', ?)").bind(now).run();
  const row = await db.prepare("SELECT value FROM tracker_meta WHERE key = 'started_at'").first<{ value: string }>();
  return row!.value;
}

export function getServeSpaFromWorker(env: Env): boolean {
  return (env.SERVE_SPA_FROM_WORKER as string) === 'true';
}

export async function evictOverLimit(db: D1Database, maxNodes: number): Promise<void> {
  const countResult = await db.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();
  const count = countResult?.count ?? 0;
  if (count <= maxNodes) return;
  const excess = count - maxNodes;
  await db
    .prepare('DELETE FROM nodes WHERE node_id IN (SELECT node_id FROM nodes ORDER BY last_seen ASC LIMIT ?)')
    .bind(excess)
    .run();
}
