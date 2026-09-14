import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackerMetaDAO } from '@chord-dht-tracker/backend-data/dao';
import { DatabaseError } from '@chord-dht-tracker/backend-errors';
import { createD1 } from '../mocks/d1';
import { okStmt } from './helpers';

function prepareCalls(db: D1Database): string[][] {
  return (db.prepare as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown as string[][];
}

function bindCalls(stmt: D1PreparedStatement): unknown[][] {
  return (stmt.bind as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TrackerMetaDAO', () => {
  it('ensureStartedAt inserts then returns the stored start time', async () => {
    const insertStmt = okStmt();
    const selectStmt = okStmt({ firstResult: { value: '2026-05-27T00:00:00.000Z' } });
    const db = createD1(insertStmt, selectStmt);
    const dao = new TrackerMetaDAO(db);

    await expect(dao.ensureStartedAt('2026-05-28T00:00:00.000Z')).resolves.toBe('2026-05-27T00:00:00.000Z');

    const calls = prepareCalls(db);
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toContain("INSERT OR IGNORE INTO tracker_meta");
    expect(bindCalls(insertStmt)[0]).toEqual(['2026-05-28T00:00:00.000Z']);
    expect(calls[1][0]).toContain("WHERE key = 'started_at'");
  });

  it('ensureStartedAt fails when the row is missing after insert', async () => {
    const dao = new TrackerMetaDAO(createD1(okStmt(), okStmt({ firstResult: null })));

    await expect(dao.ensureStartedAt('2026-05-28T00:00:00.000Z')).rejects.toThrow(DatabaseError);
  });

  it('maps D1 failures to DatabaseError', async () => {
    const db = createD1();
    (db.prepare as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('no such table: tracker_meta');
    });
    const dao = new TrackerMetaDAO(db);

    // The insert path goes through executeD1WithRetry, which wraps
    // non-retryable failures in DatabaseError without sleeping.
    await expect(dao.ensureStartedAt('2026-05-28T00:00:00.000Z')).rejects.toThrow(DatabaseError);
  });
});
