import { describe, expect, it, vi } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';

const VALID_NODE_ID = 'a'.repeat(40);
const HEARTBEAT_URL = `http://localhost/tracker/nodes/${VALID_NODE_ID}/heartbeat`;

const validBody = {
  status: 'ACTIVE',
  successor_id: 'b'.repeat(40),
  predecessor_id: 'c'.repeat(40),
  successor_list_size: 3,
  successor_list_capacity: 5,
  finger_table_coverage: 0.75,
  uptime_seconds: 300,
  maintenance_cycles: 5,
};

describe('POST /tracker/nodes/:node_id/heartbeat', () => {
  it('acknowledges a valid heartbeat and returns tracker_time', async () => {
    const db = createD1(createStmt({ changes: 1 }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { acknowledged: boolean; tracker_time: string };
    expect(body.acknowledged).toBe(true);
    expect(new Date(body.tracker_time).toISOString()).toBe(body.tracker_time);
  });

  it('accepts a heartbeat with an empty body', async () => {
    const db = createD1(createStmt({ changes: 1 }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, { method: 'POST' }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
  });

  it('returns 404 when node is not registered', async () => {
    const db = createD1(createStmt({ changes: 0 }), createStmt({ changes: 0 }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('NotFound');
  });

  it('persists topology for a registered vnode heartbeat', async () => {
    const db = createD1(
      createStmt({ changes: 0 }),
      createStmt({ changes: 1 }),
    );
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validBody,
          successor_list: ['b'.repeat(40), 'd'.repeat(40)],
          predecessor_list: ['c'.repeat(40)],
          finger_nodes: ['d'.repeat(40)],
          rtt_samples: { ['b'.repeat(40)]: 12 },
        }),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const calls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(calls[1][0]).toContain('UPDATE vnodes SET');
  });

  it('returns 400 for an invalid node_id format', async () => {
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes/not-a-valid-id/heartbeat', { method: 'POST' }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('BadRequest');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, { method: 'POST' }),
      createEnv(db, false),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(429);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('RateLimited');
  });

  it('applies batched vnode snapshots from the anchor heartbeat', async () => {
    const vnodeA = 'b'.repeat(40);
    const vnodeB = 'c'.repeat(40);
    const db = createD1(
      createStmt({ changes: 1 }),
      createStmt({ allResults: [{ vnode_id: vnodeA }, { vnode_id: vnodeB }] }),
      createStmt({ changes: 1 }),
      createStmt({ changes: 1 }),
    );
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validBody,
          vnode_heartbeats: [
            { vnode_id: vnodeA, status: 'ACTIVE', successor_list_size: 2 },
            { vnode_id: vnodeB, status: 'ACTIVE', successor_list_size: 2 },
          ],
        }),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      acknowledged: boolean;
      vnodes: { updated: number; errors: unknown[] };
    };
    expect(body.acknowledged).toBe(true);
    expect(body.vnodes.updated).toBe(2);
    expect(body.vnodes.errors).toEqual([]);
    const calls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(calls[0][0]).toContain('UPDATE nodes SET');
    expect(calls[2][0]).toContain('UPDATE vnodes SET');
    expect(calls[2][0]).toContain('AND anchor_id = ?');
  });

  it('reports unknown vnodes per-item without failing owned updates', async () => {
    const vnodeA = 'b'.repeat(40);
    const unknown = 'd'.repeat(40);
    const db = createD1(
      createStmt({ changes: 1 }),
      createStmt({ allResults: [{ vnode_id: vnodeA }] }),
      createStmt({ changes: 1 }),
    );
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validBody,
          vnode_heartbeats: [
            { vnode_id: vnodeA, status: 'ACTIVE' },
            { vnode_id: unknown, status: 'ACTIVE' },
          ],
        }),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      acknowledged: boolean;
      vnodes: { updated: number; errors: Array<{ vnode_id: string; code: string }> };
    };
    expect(body.vnodes.updated).toBe(1);
    expect(body.vnodes.errors).toEqual([{ vnode_id: unknown, code: 'UNKNOWN_VNODE' }]);
  });

  it('rejects batches over MAX_VNODES_PER_ANCHOR', async () => {
    const db = createD1(createStmt({ changes: 1 }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validBody,
          vnode_heartbeats: [
            { vnode_id: 'b'.repeat(40), status: 'ACTIVE' },
            { vnode_id: 'c'.repeat(40), status: 'ACTIVE' },
          ],
        }),
      }),
      createEnv(db, true, null, { MAX_VNODES_PER_ANCHOR: '1' }),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('BadRequest');
  });

  it('rejects a non-array vnode_heartbeats field', async () => {
    const db = createD1(createStmt({ changes: 1 }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, vnode_heartbeats: 'not-an-array' }),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
  });

  it('returns crl_version without payload when the client omits crl_version', async () => {
    const db = createD1(createStmt({ changes: 1 }), createStmt({ firstResult: { version: 4 } }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { acknowledged: boolean; crl_version?: number; crl?: unknown };
    expect(body.acknowledged).toBe(true);
    expect(body.crl_version).toBe(4);
    expect(body.crl).toBeUndefined();
  });

  it('inlines the CRL when the client crl_version is stale', async () => {
    const crlJson = JSON.stringify({
      version: 2,
      updated_at: 1780000000,
      revoked_node_ids: [],
      signature: 'sig',
    });
    const db = createD1(
      createStmt({ changes: 1 }),
      createStmt({ firstResult: { version: 2 } }),
      createStmt({ firstResult: { crl_json: crlJson } }),
    );
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, crl_version: 0 }),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      acknowledged: boolean;
      crl_version?: number;
      crl?: { version: number };
    };
    expect(body.acknowledged).toBe(true);
    expect(body.crl_version).toBe(2);
    expect(body.crl?.version).toBe(2);
  });

  it('rejects a negative crl_version with 400', async () => {
    const db = createD1(createStmt({ changes: 1 }));
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, crl_version: -1 }),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
  });
});
