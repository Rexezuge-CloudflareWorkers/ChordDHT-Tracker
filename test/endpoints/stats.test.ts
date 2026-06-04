import { describe, expect, it } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';

describe('GET /tracker/stats', () => {
  it('returns all required fields with correct types', async () => {
    const startedAt = new Date(Date.now() - 7200_000).toISOString(); // 2 hours ago
    const vnodeOldestJoinedAt = Math.floor(new Date('2026-05-27T12:00:00.000Z').getTime() / 1000);
    const vnodeNewestJoinedAt = Math.floor(new Date('2026-05-28T08:00:00.000Z').getTime() / 1000);

    const db = createD1(
      // anchor aggregate query
      createStmt({
        firstResult: {
          total_nodes: 5,
          active_nodes: 3,
          isolated_nodes: 1,
          leaving_nodes: 0,
          stale_nodes: 1,
          avg_finger_table_coverage: 0.8,
          avg_uptime_seconds: 1200,
          oldest_node_joined_at: '2026-05-27T10:00:00.000Z',
          newest_node_joined_at: '2026-05-28T06:00:00.000Z',
          expiring_cert_nodes: 2,
          active_maintenance_nodes: 1,
          avg_cache_hit_rate: 0.75,
        },
      }),
      // vnode aggregate query
      createStmt({
        firstResult: {
          total_nodes: 8,
          active_nodes: 6,
          isolated_nodes: 1,
          leaving_nodes: 1,
          stale_nodes: 2,
          avg_finger_table_coverage: 0.7,
          avg_uptime_seconds: 900,
          oldest_node_joined_at: vnodeOldestJoinedAt,
          newest_node_joined_at: vnodeNewestJoinedAt,
          expiring_cert_nodes: 0,
          active_maintenance_nodes: 3,
          avg_cache_hit_rate: 0.6,
        },
      }),
      // INSERT OR IGNORE tracker_meta
      createStmt(),
      // SELECT started_at
      createStmt({ firstResult: { value: startedAt } }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(new Request('http://localhost/tracker/stats'), createEnv(db), {} as ExecutionContext);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      anchor_nodes: {
        total_nodes: number;
        active_nodes: number;
        isolated_nodes: number;
        leaving_nodes: number;
        stale_nodes: number;
        avg_finger_table_coverage: number;
        avg_uptime_seconds: number;
        oldest_node_joined_at: string;
        newest_node_joined_at: string;
        expiring_cert_nodes: number;
        active_maintenance_nodes: number;
        avg_cache_hit_rate: number;
      };
      vnodes: {
        total_nodes: number;
        active_nodes: number;
        isolated_nodes: number;
        leaving_nodes: number;
        stale_nodes: number;
        avg_finger_table_coverage: number;
        avg_uptime_seconds: number;
        oldest_node_joined_at: string;
        newest_node_joined_at: string;
        expiring_cert_nodes: number;
        active_maintenance_nodes: number;
        avg_cache_hit_rate: number;
      };
      tracker_uptime_seconds: number;
      stats_generated_at: string;
    };

    expect(body).not.toHaveProperty('total_nodes');
    expect(body.anchor_nodes.total_nodes).toBe(5);
    expect(body.anchor_nodes.active_nodes).toBe(3);
    expect(body.anchor_nodes.isolated_nodes).toBe(1);
    expect(body.anchor_nodes.leaving_nodes).toBe(0);
    expect(body.anchor_nodes.stale_nodes).toBe(1);
    expect(body.anchor_nodes.avg_finger_table_coverage).toBe(0.8);
    expect(body.anchor_nodes.expiring_cert_nodes).toBe(2);
    expect(body.anchor_nodes.active_maintenance_nodes).toBe(1);
    expect(body.anchor_nodes.avg_cache_hit_rate).toBe(0.75);
    expect(body.vnodes.total_nodes).toBe(8);
    expect(body.vnodes.active_nodes).toBe(6);
    expect(body.vnodes.isolated_nodes).toBe(1);
    expect(body.vnodes.leaving_nodes).toBe(1);
    expect(body.vnodes.stale_nodes).toBe(2);
    expect(body.vnodes.avg_finger_table_coverage).toBe(0.7);
    expect(body.vnodes.oldest_node_joined_at).toBe('2026-05-27T12:00:00.000Z');
    expect(body.vnodes.newest_node_joined_at).toBe('2026-05-28T08:00:00.000Z');
    expect(body.vnodes.expiring_cert_nodes).toBe(0);
    expect(body.vnodes.active_maintenance_nodes).toBe(3);
    expect(body.vnodes.avg_cache_hit_rate).toBe(0.6);
    expect(body.tracker_uptime_seconds).toBeGreaterThanOrEqual(7199);
    expect(new Date(body.stats_generated_at).toISOString()).toBe(body.stats_generated_at);
  });

  it('returns null for aggregates when no nodes are registered', async () => {
    const db = createD1(
      createStmt({
        firstResult: {
          total_nodes: 0,
          active_nodes: null,
          isolated_nodes: null,
          leaving_nodes: null,
          stale_nodes: null,
          avg_finger_table_coverage: null,
          avg_uptime_seconds: null,
          oldest_node_joined_at: null,
          newest_node_joined_at: null,
          expiring_cert_nodes: null,
          active_maintenance_nodes: null,
          avg_cache_hit_rate: null,
        },
      }),
      createStmt({
        firstResult: {
          total_nodes: 0,
          active_nodes: null,
          isolated_nodes: null,
          leaving_nodes: null,
          stale_nodes: null,
          avg_finger_table_coverage: null,
          avg_uptime_seconds: null,
          oldest_node_joined_at: null,
          newest_node_joined_at: null,
          expiring_cert_nodes: null,
          active_maintenance_nodes: null,
          avg_cache_hit_rate: null,
        },
      }),
      createStmt(),
      createStmt({ firstResult: { value: new Date().toISOString() } }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(new Request('http://localhost/tracker/stats'), createEnv(db), {} as ExecutionContext);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      anchor_nodes: { total_nodes: number; avg_finger_table_coverage: null; oldest_node_joined_at: null };
      vnodes: { total_nodes: number; avg_finger_table_coverage: null; oldest_node_joined_at: null };
    };
    expect(body.anchor_nodes.total_nodes).toBe(0);
    expect(body.anchor_nodes.avg_finger_table_coverage).toBeNull();
    expect(body.anchor_nodes.oldest_node_joined_at).toBeNull();
    expect(body.vnodes.total_nodes).toBe(0);
    expect(body.vnodes.avg_finger_table_coverage).toBeNull();
    expect(body.vnodes.oldest_node_joined_at).toBeNull();
  });
});
