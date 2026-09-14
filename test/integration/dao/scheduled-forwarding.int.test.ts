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

  it('completes a run with a malformed body via controller defaults', async () => {
    const stub = testEnv.CRON_TASKS.get(testEnv.CRON_TASKS.idFromName('schedule-int'));
    const res = await stub.fetch(new Request('http://internal/run', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'completed' });
  });

  it('honours the 24h boundary and deletes orphan vnodes while recounting survivors', async () => {
    const justOver = freshNode();
    const overIso = new Date(Date.now() - (24 * 3600 + 60) * 1000).toISOString();
    await testEnv.DB.prepare('INSERT INTO nodes (node_id, uri, status, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)')
      .bind(justOver.node_id, justOver.uri, 'ACTIVE', overIso, overIso)
      .run();

    const justUnder = freshNode();
    const underIso = new Date(Date.now() - (23 * 3600 + 50 * 60) * 1000).toISOString();
    await testEnv.DB.prepare('INSERT INTO nodes (node_id, uri, status, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)')
      .bind(justUnder.node_id, justUnder.uri, 'ACTIVE', underIso, underIso)
      .run();

    // Fresh vnode under a surviving anchor. (Orphan vnodes cannot be seeded:
    // vnodes.anchor_id REFERENCES nodes(node_id) ON DELETE CASCADE with FKs
    // enforced, so deleteOrphans is defense-in-depth only. The cascade itself
    // is pinned below: removing an anchor row removes its vnodes at once.)
    const ownedId = freshNode().node_id;
    const nowUnix = Math.floor(Date.now() / 1000);
    await insertVnode(ownedId, justUnder.node_id, nowUnix);
    const cascadeAnchor = freshNode();
    const cascadeIso = new Date().toISOString();
    await testEnv.DB.prepare('INSERT INTO nodes (node_id, uri, status, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)')
      .bind(cascadeAnchor.node_id, cascadeAnchor.uri, 'ACTIVE', cascadeIso, cascadeIso)
      .run();
    const cascadeVnodeId = freshNode().node_id;
    await insertVnode(cascadeVnodeId, cascadeAnchor.node_id, nowUnix);
    await testEnv.DB.prepare('DELETE FROM nodes WHERE node_id = ?').bind(cascadeAnchor.node_id).run();
    const cascaded = await testEnv.DB.prepare('SELECT COUNT(*) as count FROM vnodes WHERE vnode_id = ?')
      .bind(cascadeVnodeId)
      .first<{ count: number }>();
    expect(cascaded?.count).toBe(0);

    const { status, body } = await runCleanup();
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'completed' });

    const anchors = await testEnv.DB.prepare('SELECT node_id FROM nodes').all<{ node_id: string }>();
    const ids = new Set((anchors.results ?? []).map((row) => row.node_id));
    expect(ids.has(justOver.node_id)).toBe(false);
    expect(ids.has(justUnder.node_id)).toBe(true);

    const vnodes = await testEnv.DB.prepare('SELECT vnode_id FROM vnodes').all<{ vnode_id: string }>();
    const vnodeIds = new Set((vnodes.results ?? []).map((row) => row.vnode_id));
    expect(vnodeIds.has(ownedId)).toBe(true);

    const survivor = await testEnv.DB.prepare('SELECT vnode_count FROM nodes WHERE node_id = ?')
      .bind(justUnder.node_id)
      .first<{ vnode_count: number }>();
    expect(survivor?.vnode_count).toBe(1);
  });
});
