import { beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, api, freshNode, registerNode, setupIntegration } from '../helpers/setup';
import type { IntegrationEnv } from '../helpers/setup';

let testEnv: IntegrationEnv;
let freshId = '';
let youngId = '';

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

function unixHoursAgo(hours: number): number {
  return Math.floor(Date.now() / 1000) - Math.floor(hours * 3600);
}

async function insertVnode(vnodeId: string, anchorId: string, lastSeenUnix: number): Promise<void> {
  await testEnv.DB.prepare(
    'INSERT INTO vnodes (vnode_id, anchor_id, vnode_index, proof_json, status, last_seen, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(vnodeId, anchorId, 0, '{}', 'ACTIVE', lastSeenUnix, lastSeenUnix)
    .run();
}

beforeAll(async () => {
  testEnv = await setupIntegration();
  const fresh = freshNode();
  freshId = fresh.node_id;
  await registerNode(freshId, fresh.uri);

  // Anchor older than STALE_THRESHOLD_SECONDS (600s) but younger than the
  // cleanup horizon (24h) must survive; a 30h anchor must not.
  const young = freshNode();
  youngId = young.node_id;
  const youngIso = isoHoursAgo(1);
  await testEnv.DB.prepare('INSERT INTO nodes (node_id, uri, status, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)')
    .bind(young.node_id, young.uri, 'ACTIVE', youngIso, youngIso)
    .run();

  const old = freshNode();
  const oldIso = isoHoursAgo(30);
  const oldUnix = unixHoursAgo(30);
  await testEnv.DB.prepare('INSERT INTO nodes (node_id, uri, status, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)')
    .bind(old.node_id, old.uri, 'ACTIVE', oldIso, oldIso)
    .run();

  // Stale vnode under the fresh anchor: pruned by last_seen while the anchor
  // survives (exercises the vnode_count recount). Stale vnode under the old
  // anchor: pruned with its anchor.
  await insertVnode(freshNode().node_id, freshId, oldUnix);
  await insertVnode(freshNode().node_id, old.node_id, oldUnix);
});

async function runCleanup(): Promise<{ status: number; body: unknown }> {
  const stub = testEnv.CRON_TASKS.get(testEnv.CRON_TASKS.idFromName('schedule-int'));
  const res = await stub.fetch(
    new Request('http://internal/run', {
      method: 'POST',
      body: JSON.stringify({ cron: '0 * * * *', scheduledTime: Date.now() }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

describe('scheduled cleanup forwarding via the CRON_TASKS DO', () => {
  it('completes a run and prunes stale anchors and vnodes but keeps fresh rows', async () => {
    const { status, body } = await runCleanup();
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'completed' });

    const anchors = await testEnv.DB.prepare('SELECT node_id FROM nodes').all<{ node_id: string }>();
    const ids = new Set((anchors.results ?? []).map((row) => row.node_id));
    expect(ids.has(freshId)).toBe(true);
    expect(ids.has(youngId)).toBe(true);
    expect(ids.size).toBe(2);

    const vnodes = await testEnv.DB.prepare('SELECT COUNT(*) as count FROM vnodes').first<{ count: number }>();
    expect(vnodes?.count).toBe(0);
  });

  it('is idempotent: a second run completes with nothing left to prune', async () => {
    const { status, body } = await runCleanup();
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'completed' });
    expect((await api(`/tracker/nodes/${freshId}`, { headers: adminHeaders() })).status).toBe(200);
  });
});
