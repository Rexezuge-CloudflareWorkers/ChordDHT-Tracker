import { describe, expect, it } from 'vitest';
import { CertService } from '@chord-dht-tracker/backend-services/auth';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';

const certService = new CertService({} as ServiceEnv);
const hashURI = (uri: string): Promise<string> => certService.hashURI(uri);

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

  it('treats a quiet-mode heartbeat (300s old) as live under the default threshold', async () => {
    const uris = ['https://anchor-a.example.com'];
    const ids = await Promise.all(uris.map((uri) => hashURI(uri)));
    // Client quiet-mode interval is 300s; default stale window is 600s.
    const quietHeartbeat = new Date(Date.now() - 300_000).toISOString();
    const db = createD1(
      createStmt({
        allResults: [{ node_id: ids[0], uri: uris[0], status: 'ACTIVE', last_seen: quietHeartbeat }],
      }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/stable_base'),
      createEnv(db, true, null, {
        STABLE_BASE_MEMBERS: uris.join(','),
        STABLE_BASE_MIN_SIZE: '1',
      }),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { live_count: number; degraded: boolean; members: Array<{ live: boolean }> };
    expect(body.live_count).toBe(1);
    expect(body.degraded).toBe(false);
    expect(body.members[0].live).toBe(true);
  });

  it('treats a heartbeat older than the default threshold as stale', async () => {
    const uris = ['https://anchor-a.example.com'];
    const ids = await Promise.all(uris.map((uri) => hashURI(uri)));
    const expired = new Date(Date.now() - 650_000).toISOString();
    const db = createD1(
      createStmt({
        allResults: [{ node_id: ids[0], uri: uris[0], status: 'ACTIVE', last_seen: expired }],
      }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/stable_base'),
      createEnv(db, true, null, {
        STABLE_BASE_MEMBERS: uris.join(','),
        STABLE_BASE_MIN_SIZE: '1',
      }),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { live_count: number; degraded: boolean; members: Array<{ live: boolean }> };
    expect(body.live_count).toBe(0);
    expect(body.degraded).toBe(true);
    expect(body.members[0].live).toBe(false);
  });

  it('falls back to the default threshold when the var is missing or invalid', async () => {
    const uris = ['https://anchor-a.example.com'];
    const ids = await Promise.all(uris.map((uri) => hashURI(uri)));
    const quietHeartbeat = new Date(Date.now() - 300_000).toISOString();
    const db = createD1(
      createStmt({
        allResults: [{ node_id: ids[0], uri: uris[0], status: 'ACTIVE', last_seen: quietHeartbeat }],
      }),
    );

    const worker = new ChordDHTTrackerWorker();
    const env = createEnv(db, true, null, {
      STABLE_BASE_MEMBERS: uris.join(','),
      STABLE_BASE_MIN_SIZE: '1',
      STALE_THRESHOLD_SECONDS: 'not-a-number',
    });
    const res = await worker.fetch(new Request('http://localhost/tracker/stable_base'), env, {} as ExecutionContext);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { live_count: number; stale_threshold_seconds: number };
    expect(body.live_count).toBe(1);
    expect(body.stale_threshold_seconds).toBe(600);
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
