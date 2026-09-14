import { beforeAll, describe, expect, it } from 'vitest';
import { api, freshNode, postJson, registerNode, setupIntegration } from '../helpers/setup';

beforeAll(async () => {
  await setupIntegration();
  const first = freshNode();
  const second = freshNode();
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
});
