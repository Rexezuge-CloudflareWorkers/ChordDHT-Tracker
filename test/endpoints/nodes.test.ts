import { describe, expect, it, vi } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';

const VALID_NODE_ID = 'a'.repeat(40);
const VALID_URI = 'https://node1.example.com';

const node = {
  node_id: VALID_NODE_ID,
  uri: VALID_URI,
  status: 'ACTIVE',
  joined_at: '2026-05-28T00:00:00.000Z',
  last_seen: '2026-05-28T06:00:00.000Z',
  report_count: 10,
  successor_id: null,
  predecessor_id: null,
  successor_list_size: null,
  successor_list_capacity: null,
  finger_table_coverage: null,
  uptime_seconds: null,
  maintenance_cycles: null,
};

// ─── POST /tracker/nodes ─────────────────────────────────────────────────────

describe('POST /tracker/nodes', () => {
  it('registers a new node and returns the node count', async () => {
    const db = createD1(
      createStmt({ changes: 1 }),                // INSERT
      createStmt({ firstResult: { count: 1 } }), // evictOverLimit COUNT
      createStmt({ firstResult: { count: 1 } }), // response COUNT
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: VALID_NODE_ID, uri: VALID_URI }),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { registered: boolean; known_nodes_count: number; message: string };
    expect(body.registered).toBe(true);
    expect(body.known_nodes_count).toBe(1);
    expect(typeof body.message).toBe('string');
  });

  it('returns 400 when node_id is not 40 hex characters', async () => {
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: 'tooshort', uri: VALID_URI }),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 when node_id contains uppercase hex', async () => {
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: 'A'.repeat(40), uri: VALID_URI }),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when uri does not start with https://', async () => {
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: VALID_NODE_ID, uri: 'http://node1.example.com' }),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for malformed JSON body', async () => {
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: VALID_NODE_ID, uri: VALID_URI }),
      }),
      createEnv(db, false),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});

// ─── DELETE /tracker/nodes/:node_id ──────────────────────────────────────────

describe('DELETE /tracker/nodes/:node_id', () => {
  it('deregisters an existing node', async () => {
    const db = createD1(createStmt({ changes: 1 }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${VALID_NODE_ID}`, { method: 'DELETE' }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { deregistered: boolean; node_id: string };
    expect(body.deregistered).toBe(true);
    expect(body.node_id).toBe(VALID_NODE_ID);
  });

  it('returns 404 for an unknown node', async () => {
    const db = createD1(createStmt({ changes: 0 }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${VALID_NODE_ID}`, { method: 'DELETE' }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NODE_NOT_FOUND');
  });

  it('deregisters an existing vnode', async () => {
    const db = createD1(
      createStmt({ changes: 0 }),
      createStmt({ firstResult: { anchor_id: VALID_NODE_ID } }),
      createStmt({ changes: 1 }),
      createStmt({ firstResult: { count: 0 } }),
      createStmt({ changes: 1 }),
    );
    const vnodeID = 'b'.repeat(40);
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${vnodeID}`, { method: 'DELETE' }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { deregistered: boolean; node_id: string };
    expect(body.deregistered).toBe(true);
    expect(body.node_id).toBe(vnodeID);
    const calls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(calls[2][0]).toContain('DELETE FROM vnodes');
  });

  it('returns 400 for an invalid node_id in the path', async () => {
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes/bad-id', { method: 'DELETE' }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
  });
});

// ─── GET /tracker/nodes/seeds ────────────────────────────────────────────────

describe('GET /tracker/nodes/seeds', () => {
  it('returns a list of seed nodes and total_known count', async () => {
    const seeds = [
      { node_id: VALID_NODE_ID, uri: VALID_URI },
      { node_id: 'b'.repeat(40), uri: 'https://node2.example.com' },
    ];
    const db = createD1(
      createStmt({ allResults: seeds }),          // SELECT seeds
      createStmt({ firstResult: { count: 5 } }), // total_known COUNT
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes/seeds?count=2'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { seeds: typeof seeds; total_known: number; note: string };
    expect(body.seeds).toHaveLength(2);
    expect(body.total_known).toBe(5);
    expect(typeof body.note).toBe('string');
  });

  it('returns an empty seeds array when no nodes are registered', async () => {
    const db = createD1(
      createStmt({ allResults: [] }),
      createStmt({ firstResult: { count: 0 } }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes/seeds'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { seeds: unknown[]; total_known: number };
    expect(body.seeds).toHaveLength(0);
    expect(body.total_known).toBe(0);
  });
});

// ─── GET /tracker/nodes ──────────────────────────────────────────────────────

describe('GET /tracker/nodes', () => {
  it('returns a paginated list of nodes', async () => {
    const db = createD1(
      createStmt({ allResults: [node] }),
      createStmt({ firstResult: { count: 1 } }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes?limit=10&offset=0'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { nodes: typeof node[]; total: number; limit: number; offset: number };
    expect(body.nodes).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
  });

  it('filters by status when the query parameter is provided', async () => {
    const db = createD1(
      createStmt({ allResults: [node] }),
      createStmt({ firstResult: { count: 1 } }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes?status=ACTIVE'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    // Verify the status filter was passed to D1
    const calls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(calls[0][0]).toContain('WHERE status = ?');
  });

  it('expands logical vnode records for authenticated topology views', async () => {
    const anchor = {
      ...node,
      vnode_count: 1,
      region: 'iad',
      successor_list: null,
      predecessor_list: null,
      rtt_samples: null,
      finger_nodes: null,
    };
    const vnodeID = 'b'.repeat(40);
    const logicalVNode = {
      vnode_id: vnodeID,
      anchor_id: VALID_NODE_ID,
      vnode_index: 1,
      status: 'ACTIVE',
      last_seen: 1780000000,
      joined_at: 1780000000,
      report_count: 3,
      successor_id: 'c'.repeat(40),
      predecessor_id: VALID_NODE_ID,
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
      successor_list: JSON.stringify(['c'.repeat(40), VALID_NODE_ID]),
      predecessor_list: JSON.stringify([VALID_NODE_ID]),
      rtt_samples: JSON.stringify({ [VALID_NODE_ID]: 10 }),
      finger_nodes: JSON.stringify(['c'.repeat(40)]),
      anchor_uri: VALID_URI,
      anchor_joined_at: node.joined_at,
      anchor_last_seen: node.last_seen,
      anchor_region: 'iad',
    };
    const db = createD1(
      createStmt({ allResults: [anchor] }),
      createStmt({ firstResult: { count: 1 } }),
      createStmt({ allResults: [{ vnode_id: vnodeID, vnode_index: 1, status: 'ACTIVE' }] }),
      createStmt({ allResults: [logicalVNode] }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes?include_vnodes=true', {
        headers: { Authorization: 'Bearer test-secret' },
      }),
      createEnv(db, true, 'test-secret'),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { nodes: Array<{ node_id: string; is_vnode?: boolean; successor_list?: string[] }> };
    expect(body.nodes).toHaveLength(2);
    expect(body.nodes[1].node_id).toBe(vnodeID);
    expect(body.nodes[1].is_vnode).toBe(true);
    expect(body.nodes[1].successor_list).toEqual(['c'.repeat(40), VALID_NODE_ID]);
  });
});

// ─── GET /tracker/nodes/:node_id ─────────────────────────────────────────────

describe('GET /tracker/nodes/:node_id', () => {
  it('returns the full node record for an authenticated admin', async () => {
    const db = createD1(createStmt({ firstResult: node }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${VALID_NODE_ID}`, {
        headers: { Authorization: 'Bearer test-secret' },
      }),
      createEnv(db, true, 'test-secret'),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof node;
    expect(body.node_id).toBe(VALID_NODE_ID);
    expect(body.uri).toBe(VALID_URI);
    expect(body.status).toBe('ACTIVE');
  });

  it('redacts sensitive fields for anonymous callers', async () => {
    const db = createD1(createStmt({ firstResult: node }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${VALID_NODE_ID}`),
      createEnv(db, true, 'test-secret'),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { uri: null; node_id: string };
    expect(body.node_id).toBe(VALID_NODE_ID);
    expect(body.uri).toBeNull();
  });

  it('returns 404 for an unknown node_id', async () => {
    const db = createD1(createStmt({ firstResult: null }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${VALID_NODE_ID}`),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NODE_NOT_FOUND');
  });

  it('returns 400 for an invalid node_id format in the path', async () => {
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes/not-valid'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
  });
});
