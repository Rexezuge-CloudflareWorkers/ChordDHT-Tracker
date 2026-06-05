import { describe, expect, it } from 'vitest';
import { hashURI } from '@/auth';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';

describe('GET /tracker/stable_base', () => {
  it('reports healthy stable base when enough configured members are live', async () => {
    const uris = ['https://anchor-a.example.com', 'https://anchor-b.example.com'];
    const ids = await Promise.all(uris.map((uri) => hashURI(uri)));
    const now = new Date().toISOString();
    const db = createD1(
      createStmt({
        allResults: [
          { node_id: ids[0], uri: uris[0], status: 'ACTIVE', last_seen: now },
          { node_id: ids[1], uri: uris[1], status: 'ACTIVE', last_seen: now },
        ],
      }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/stable_base'),
      createEnv(db, true, null, {
        STABLE_BASE_MEMBERS: uris.join(','),
        STABLE_BASE_MIN_SIZE: '2',
        STALE_THRESHOLD_SECONDS: '180',
      }),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { live_count: number; degraded: boolean; emergency: boolean; members: Array<{ live: boolean }> };
    expect(body.live_count).toBe(2);
    expect(body.degraded).toBe(false);
    expect(body.emergency).toBe(false);
    expect(body.members.every((member) => member.live)).toBe(true);
  });

  it('reports degraded stable base when configured members are stale or missing', async () => {
    const uris = ['https://anchor-a.example.com', 'https://anchor-b.example.com'];
    const ids = await Promise.all(uris.map((uri) => hashURI(uri)));
    const stale = new Date(Date.now() - 3600_000).toISOString();
    const db = createD1(
      createStmt({
        allResults: [{ node_id: ids[0], uri: uris[0], status: 'ACTIVE', last_seen: stale }],
      }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/stable_base'),
      createEnv(db, true, null, {
        STABLE_BASE_MEMBERS: uris.join(','),
        STABLE_BASE_MIN_SIZE: '2',
        STALE_THRESHOLD_SECONDS: '180',
      }),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { live_count: number; degraded: boolean; members: Array<{ registered: boolean; live: boolean }> };
    expect(body.live_count).toBe(0);
    expect(body.degraded).toBe(true);
    expect(body.members[0].registered).toBe(true);
    expect(body.members[0].live).toBe(false);
    expect(body.members[1].registered).toBe(false);
  });
});
