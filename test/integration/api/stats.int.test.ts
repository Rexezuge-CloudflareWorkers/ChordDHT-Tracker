import { beforeAll, describe, expect, it } from 'vitest';
import { api, freshNode, postJson, registerNode, setupIntegration } from '../helpers/setup';
import type { IntegrationEnv } from '../helpers/setup';

let testEnv: IntegrationEnv;
const first = freshNode();
const second = freshNode();

beforeAll(async () => {
  testEnv = await setupIntegration();
  await registerNode(first.node_id, first.uri);
  await registerNode(second.node_id, second.uri);
  await postJson(`/tracker/nodes/${first.node_id}/heartbeat`, {
    status: 'ACTIVE',
    finger_table_coverage: 0.5,
    uptime_seconds: 120,
  });
});

describe('GET /tracker/stats', () => {
  it('aggregates anchor ring statistics', async () => {
    const res = await api('/tracker/stats');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      anchor_nodes: {
        total_nodes: number;
        active_nodes: number;
        stale_nodes: number;
        avg_finger_table_coverage: number | null;
        avg_uptime_seconds: number | null;
        oldest_node_joined_at: string | null;
        newest_node_joined_at: string | null;
      };
      vnodes: { total_nodes: number };
      tracker_uptime_seconds: number;
      stale_threshold_seconds: number;
      stats_generated_at: string;
    };
    expect(body.anchor_nodes.total_nodes).toBe(2);
    expect(body.anchor_nodes.active_nodes).toBe(2);
    expect(body.anchor_nodes.stale_nodes).toBe(0);
    expect(body.anchor_nodes.avg_finger_table_coverage).toBeCloseTo(0.5, 5);
    expect(body.anchor_nodes.avg_uptime_seconds).toBeCloseTo(120, 5);
    expect(Number.isNaN(Date.parse(body.anchor_nodes.oldest_node_joined_at!))).toBe(false);
    expect(Number.isNaN(Date.parse(body.anchor_nodes.newest_node_joined_at!))).toBe(false);
    expect(body.vnodes.total_nodes).toBe(0);
    expect(body.stale_threshold_seconds).toBe(600);
    expect(typeof body.tracker_uptime_seconds).toBe('number');
    expect(Number.isNaN(Date.parse(body.stats_generated_at))).toBe(false);
  });

  it('counts leaving/isolated, maintenance, and cache-hit aggregates', async () => {
    await postJson(`/tracker/nodes/${second.node_id}/heartbeat`, {
      status: 'LEAVING',
      maintenance_mode: 'ACTIVE_MAINTENANCE',
      cache_hits: 3,
      cache_misses: 1,
    });
    const third = freshNode();
    await registerNode(third.node_id, third.uri);
    await postJson(`/tracker/nodes/${third.node_id}/heartbeat`, { status: 'ISOLATED' });

    const body = (await (await api('/tracker/stats')).json()) as {
      anchor_nodes: {
        total_nodes: number;
        active_nodes: number;
        isolated_nodes: number;
        leaving_nodes: number;
        active_maintenance_nodes: number;
        avg_cache_hit_rate: number | null;
      };
    };
    expect(body.anchor_nodes.total_nodes).toBe(3);
    expect(body.anchor_nodes.leaving_nodes).toBe(1);
    expect(body.anchor_nodes.isolated_nodes).toBe(1);
    expect(body.anchor_nodes.active_maintenance_nodes).toBe(1);
    expect(body.anchor_nodes.avg_cache_hit_rate).toBeCloseTo(0.75, 5);
  });

  it('counts stale anchors and vnode aggregates', async () => {
    const staleIso = new Date(Date.now() - 3600 * 1000).toISOString();
    const staleUnix = Math.floor(Date.now() / 1000) - 3600;
    await testEnv.DB.prepare('UPDATE nodes SET last_seen = ? WHERE node_id = ?')
      .bind(staleIso, second.node_id)
      .run();
    await testEnv.DB.prepare(
      'INSERT INTO vnodes (vnode_id, anchor_id, vnode_index, proof_json, status, last_seen, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(freshNode().node_id, first.node_id, 0, '{}', 'ACTIVE', staleUnix, staleUnix)
      .run();

    const body = (await (await api('/tracker/stats')).json()) as {
      anchor_nodes: { stale_nodes: number };
      vnodes: { total_nodes: number; stale_nodes: number; oldest_node_joined_at: string | null };
    };
    expect(body.anchor_nodes.stale_nodes).toBe(1);
    expect(body.vnodes.total_nodes).toBe(1);
    expect(Number.isNaN(Date.parse(body.vnodes.oldest_node_joined_at!))).toBe(false);
  });
});
