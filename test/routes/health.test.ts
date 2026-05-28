import { describe, expect, it } from 'vitest';
import app from '../../apps/api/src/index';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';

describe('GET /tracker/health', () => {
  it('returns ok status with uptime and timestamp', async () => {
    const startedAt = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago
    const db = createD1(
      createStmt(), // INSERT OR IGNORE into tracker_meta
      createStmt({ firstResult: { value: startedAt } }), // SELECT started_at
    );

    const res = await app.fetch(new Request('http://localhost/tracker/health'), createEnv(db), {} as ExecutionContext);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; uptime_seconds: number; timestamp: string };
    expect(body.status).toBe('ok');
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(3599);
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
