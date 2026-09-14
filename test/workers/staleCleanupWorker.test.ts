import { describe, expect, it, vi } from 'vitest';
import { StaleCleanupWorker } from '@/workers/StaleCleanupWorker';
import { tasksForPhase } from '@/cron/TaskRegistry';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';

function createDOState() {
  return { waitUntil: vi.fn(), storage: {} } as unknown as DurableObjectState;
}

function createWorkerEnv() {
  const db = createD1(createStmt({ changes: 1 }), createStmt({ changes: 2 }), createStmt({ changes: 0 }), createStmt());
  return createEnv(db, true, null, { STALE_CLEANUP_AFTER_HOURS: '24' });
}

describe('StaleCleanupWorker', () => {
  it('returns 404 for unknown paths and 405 for non-POST', async () => {
    const env = createWorkerEnv();
    const worker = new StaleCleanupWorker(createDOState(), env);

    const notFound = await worker.fetch(new Request('http://internal/other', { method: 'POST' }));
    expect(notFound.status).toBe(404);

    const wrongMethod = await worker.fetch(new Request('http://internal/run', { method: 'GET' }));
    expect(wrongMethod.status).toBe(405);
  });

  it('runs phase 1 then phase 2 tasks and returns completed', async () => {
    const env = createWorkerEnv();
    const worker = new StaleCleanupWorker(createDOState(), env);

    const res = await worker.fetch(
      new Request('http://internal/run', {
        method: 'POST',
        body: JSON.stringify({ cron: '0 * * * *', scheduledTime: 1_700_000_000_000 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'completed' });
  });

  it('returns 202 already_running for concurrent runs', async () => {
    const env = createWorkerEnv();
    const worker = new StaleCleanupWorker(createDOState(), env);
    const makeReq = () =>
      new Request('http://internal/run', {
        method: 'POST',
        body: JSON.stringify({ cron: '0 * * * *', scheduledTime: Date.now() }),
      });

    const first = worker.fetch(makeReq());
    const second = worker.fetch(makeReq());
    const [r1, r2] = await Promise.all([first, second]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 202]);
    const bodies = await Promise.all([r1.json(), r2.json()]);
    expect(bodies).toContainEqual({ status: 'already_running' });
    expect(bodies).toContainEqual({ status: 'completed' });
  });

  it('exposes the cleanup task in phase 1 registry', () => {
    expect(tasksForPhase(1).length).toBeGreaterThan(0);
    expect(tasksForPhase(2)).toEqual([]);
  });
});
