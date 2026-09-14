import { beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, api, freshNode, registerNode, setupIntegration } from '../helpers/setup';
import type { IntegrationEnv } from '../helpers/setup';

let testEnv: IntegrationEnv;
let freshId = '';

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

beforeAll(async () => {
  testEnv = await setupIntegration();
  const fresh = freshNode();
  freshId = fresh.node_id;
  await registerNode(freshId, fresh.uri);

  // Seed stale rows directly: anchor B unseen for 30h (cleanup horizon 24h),
  // plus a stale anchor C owning a stale vnode.
  const staleB = freshNode();
  const staleC = freshNode();
  const staleVnode = freshNode();
  const oldIso = isoHoursAgo(30);
  const oldUnix = Math.floor(Date.now() / 1000) - 30 * 3600;
  await testEnv.DB.prepare(
    'INSERT INTO nodes (node_id, uri, status, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(staleB.node_id, staleB.uri, 'ACTIVE', oldIso, oldIso)
    .run();
  await testEnv.DB.prepare(
    'INSERT INTO nodes (node_id, uri, status, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(staleC.node_id, staleC.uri, 'ACTIVE', oldIso, oldIso)
    .run();
  await testEnv.DB.prepare(
    'INSERT INTO vnodes (vnode_id, anchor_id, vnode_index, proof_json, status, last_seen, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(staleVnode.node_id, staleC.node_id, 0, '{}', 'ACTIVE', oldUnix, oldUnix)
    .run();
});

async function runStaleCleanup(): Promise<{ status: number; body: unknown }> {
  const stub = testEnv.CRON_TASKS.get(testEnv.CRON_TASKS.idFromName('prune-int'));
  const res = await stub.fetch(
    new Request('http://internal/run', {
      method: 'POST',
      body: JSON.stringify({ cron: '0 * * * *', scheduledTime: Date.now() }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

describe('stale pruning via the CRON_TASKS DO', () => {
  it('rejects unknown DO paths and non-POST runs', async () => {
    const stub = testEnv.CRON_TASKS.get(testEnv.CRON_TASKS.idFromName('prune-int'));
    expect((await stub.fetch(new Request('http://internal/other', { method: 'POST' }))).status).toBe(404);
    expect((await stub.fetch(new Request('http://internal/run', { method: 'GET' }))).status).toBe(405);
  });

  it('deletes stale anchors and vnodes but keeps the fresh node', async () => {
    const { status, body } = await runStaleCleanup();
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'completed' });

    expect((await api(`/tracker/nodes/${freshId}`, { headers: adminHeaders() })).status).toBe(200);

    const remaining = await testEnv.DB.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();
    expect(remaining?.count).toBe(1);
    const vnodes = await testEnv.DB.prepare('SELECT COUNT(*) as count FROM vnodes').first<{ count: number }>();
    expect(vnodes?.count).toBe(0);
  });

  it('keeps unauthenticated reads masked to node_id after cleanup', async () => {
    const res = await api('/tracker/nodes');
    const body = (await res.json()) as { nodes: Record<string, unknown>[]; total: number };
    expect(body.total).toBe(1);
    expect(body.nodes[0]?.node_id).toBe(freshId);
    for (const [key, value] of Object.entries(body.nodes[0]!)) {
      if (key === 'node_id') continue;
      expect(value, `expected ${key} to be masked`).toBeNull();
    }
  });
});
