import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';
import { okStmt } from '../dao/helpers';

const ANCHOR = 'a'.repeat(40);
const VNODE = 'b'.repeat(40);
const URI = 'https://node1.example.com';

const anchorRow = {
  node_id: ANCHOR,
  uri: URI,
  status: 'ACTIVE',
  joined_at: '2026-05-28T00:00:00.000Z',
  last_seen: '2026-05-28T06:00:00.000Z',
  report_count: 10,
};

// Full logical-vnode row as returned by the vnodes JOIN for admin lookups.
const logicalVNode = {
  vnode_id: VNODE,
  anchor_id: ANCHOR,
  vnode_index: 1,
  status: 'ACTIVE',
  last_seen: 1780000000,
  joined_at: 1780000000,
  report_count: 3,
  successor_id: 'c'.repeat(40),
  predecessor_id: ANCHOR,
  successor_list_size: 2,
  successor_list_capacity: 5,
  finger_table_coverage: 0.5,
  uptime_seconds: 120,
  maintenance_cycles: 4,
  maintenance_mode: 'ACTIVE_MAINTENANCE',
  cache_hits: 1,
  cache_misses: 2,
  cache_size: 3,
  predecessor_list_size: 1,
  successor_list: JSON.stringify(['c'.repeat(40), ANCHOR]),
  predecessor_list: JSON.stringify([ANCHOR]),
  rtt_samples: JSON.stringify({ [ANCHOR]: 10 }),
  finger_nodes: JSON.stringify(['c'.repeat(40)]),
  anchor_uri: URI,
  anchor_joined_at: anchorRow.joined_at,
  anchor_last_seen: anchorRow.last_seen,
  anchor_region: 'iad',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /tracker/nodes/:node_id edge cases', () => {
  it('rejects uppercase and overlong ids', async () => {
    const worker = new ChordDHTTrackerWorker();
    for (const bad of ['A'.repeat(40), `${ANCHOR}00`, 'xyz']) {
      const res = await worker.fetch(
        new Request(`http://localhost/tracker/nodes/${bad}`),
        createEnv(createD1()),
        {} as ExecutionContext,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { Exception: { Type: string; Message: string } };
      expect(body.Exception.Type).toBe('BadRequest');
    }
  });

  it('returns 404 for an unknown anchor without extra lookups', async () => {
    const db = createD1(createStmt({ firstResult: null }));

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${ANCHOR}`),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(404);
    // Anonymous callers never reach the vnode fallback query.
    expect((db.prepare as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('returns 404 for an unknown id even as admin', async () => {
    const db = createD1(createStmt({ firstResult: null }), createStmt({ firstResult: null }));

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${VNODE}`, {
        headers: { Authorization: 'Bearer test-secret' },
      }),
      createEnv(db, true, 'test-secret'),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('NotFound');
  });

  it('resolves a vnode through the admin fallback', async () => {
    const db = createD1(createStmt({ firstResult: null }), createStmt({ firstResult: logicalVNode }));

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${VNODE}`, {
        headers: { Authorization: 'Bearer test-secret' },
      }),
      createEnv(db, true, 'test-secret'),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { node_id: string; is_vnode: boolean; uri: string };
    expect(body.node_id).toBe(VNODE);
    expect(body.is_vnode).toBe(true);
    expect(body.uri).toBe(URI);
  });

  it('does not leak vnodes to anonymous callers', async () => {
    const db = createD1(createStmt({ firstResult: null }));

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${VNODE}`),
      createEnv(db, true, 'test-secret'),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(404);
  });
});

describe('DELETE /tracker/nodes/:node_id edge cases', () => {
  it('rejects malformed ids', async () => {
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${'B'.repeat(40)}`, { method: 'DELETE' }),
      createEnv(createD1()),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
  });

  it('returns 404 when neither anchor nor vnode exists', async () => {
    const db = createD1(okStmt({ changes: 0 }), createStmt({ firstResult: null }));

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${ANCHOR}`, { method: 'DELETE' }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('NotFound');
  });

  it('acknowledges anchor deletion with the node id', async () => {
    // Anchor delete + cascade of the anchor's vnodes.
    const db = createD1(okStmt({ changes: 1 }), okStmt());

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${ANCHOR}`, { method: 'DELETE' }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { deregistered: boolean; node_id: string };
    expect(body).toEqual({ deregistered: true, node_id: ANCHOR });
  });
});
