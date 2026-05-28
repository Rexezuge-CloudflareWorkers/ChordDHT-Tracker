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
});

// ─── GET /tracker/nodes/:node_id ─────────────────────────────────────────────

describe('GET /tracker/nodes/:node_id', () => {
  it('returns the full node record for a known node', async () => {
    const db = createD1(createStmt({ firstResult: node }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/${VALID_NODE_ID}`),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof node;
    expect(body.node_id).toBe(VALID_NODE_ID);
    expect(body.uri).toBe(VALID_URI);
    expect(body.status).toBe('ACTIVE');
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
