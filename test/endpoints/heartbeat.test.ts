import { describe, expect, it } from 'vitest';
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
    const db = createD1(createStmt({ changes: 0 }));
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
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NODE_NOT_FOUND');
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
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_REQUEST');
  });
});
