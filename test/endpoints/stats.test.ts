import { describe, expect, it } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';

describe('GET /tracker/stats', () => {
  it('returns all required fields with correct types', async () => {
    const startedAt = new Date(Date.now() - 7200_000).toISOString(); // 2 hours ago

    const db = createD1(
      // aggregate query
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
      total_nodes: number;
      active_nodes: number;
      isolated_nodes: number;
      leaving_nodes: number;
      stale_nodes: number;
      avg_finger_table_coverage: number;
      avg_uptime_seconds: number;
      oldest_node_joined_at: string;
      newest_node_joined_at: string;
      tracker_uptime_seconds: number;
      stats_generated_at: string;
    };

    expect(body.total_nodes).toBe(5);
    expect(body.active_nodes).toBe(3);
    expect(body.isolated_nodes).toBe(1);
    expect(body.leaving_nodes).toBe(0);
    expect(body.stale_nodes).toBe(1);
    expect(body.avg_finger_table_coverage).toBe(0.8);
    expect(body.tracker_uptime_seconds).toBeGreaterThanOrEqual(7199);
    expect(new Date(body.stats_generated_at).toISOString()).toBe(body.stats_generated_at);
  });

  it('returns null for aggregates when no nodes are registered', async () => {
    const db = createD1(
      createStmt({
        firstResult: {
          total_nodes: 0,
          active_nodes: 0,
          isolated_nodes: 0,
          leaving_nodes: 0,
          stale_nodes: 0,
          avg_finger_table_coverage: null,
          avg_uptime_seconds: null,
          oldest_node_joined_at: null,
          newest_node_joined_at: null,
        },
      }),
      createStmt(),
      createStmt({ firstResult: { value: new Date().toISOString() } }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(new Request('http://localhost/tracker/stats'), createEnv(db), {} as ExecutionContext);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { avg_finger_table_coverage: null; oldest_node_joined_at: null };
    expect(body.avg_finger_table_coverage).toBeNull();
    expect(body.oldest_node_joined_at).toBeNull();
  });
});
