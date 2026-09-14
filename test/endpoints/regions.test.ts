import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1 } from '../mocks/d1';
import { createEnv } from '../mocks/env';
import { okStmt } from '../dao/helpers';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /tracker/regions', () => {
  it('returns region counts mapped by region', async () => {
    const db = createD1(
      okStmt({ allResults: [{ region: 'iad', count: 3 }, { region: 'lhr', count: 1 }] }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/regions'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { regions: Record<string, number> };
    expect(body).toEqual({ regions: { iad: 3, lhr: 1 } });
  });

  it('returns an empty map when no regions are known', async () => {
    const db = createD1(okStmt({ allResults: [] }));

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/regions'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { regions: Record<string, number> };
    expect(body).toEqual({ regions: {} });
  });

  it('aggregates from the nodes table ordered by count', async () => {
    const stmt = okStmt({ allResults: [] });
    const db = createD1(stmt);

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/regions'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const calls = (db.prepare as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown as string[][];
    expect(calls[0][0]).toContain('GROUP BY region');
    expect(stmt.bind as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
