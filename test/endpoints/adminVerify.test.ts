import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1 } from '../mocks/d1';
import { createEnv } from '../mocks/env';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /tracker/admin/verify', () => {
  it('confirms a valid admin token', async () => {
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/admin/verify', {
        headers: { Authorization: 'Bearer test-secret' },
      }),
      createEnv(createD1(), true, 'test-secret'),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { admin: boolean };
    expect(body).toEqual({ admin: true });
  });

  it('rejects requests without a token', async () => {
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/admin/verify'),
      createEnv(createD1(), true, 'test-secret'),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('Unauthorized');
  });

  it('rejects wrong tokens', async () => {
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/admin/verify', {
        headers: { Authorization: 'Bearer wrong-secret' },
      }),
      createEnv(createD1(), true, 'test-secret'),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(401);
  });

  it('rejects when no admin secret is configured', async () => {
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/admin/verify', {
        headers: { Authorization: 'Bearer test-secret' },
      }),
      createEnv(createD1()),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(401);
  });
});
