import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrlDAO } from '@chord-dht-tracker/backend-data/dao';
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

describe('CrlDAO', () => {
  it('getLatest returns the newest stored CRL json', async () => {
    const dao = new CrlDAO(createD1(okStmt({ firstResult: { crl_json: '{"version":2}' } })));

    await expect(dao.getLatest()).resolves.toBe('{"version":2}');
  });

  it('getLatest returns null when no CRL is stored', async () => {
    const dao = new CrlDAO(createD1(okStmt({ firstResult: null })));

    await expect(dao.getLatest()).resolves.toBeNull();
  });

  it('getLatestVersion returns the newest version or null', async () => {
    const stored = new CrlDAO(createD1(okStmt({ firstResult: { version: 7 } })));
    const empty = new CrlDAO(createD1(okStmt({ firstResult: null })));

    await expect(stored.getLatestVersion()).resolves.toBe(7);
    await expect(empty.getLatestVersion()).resolves.toBeNull();
  });

  it('insert binds version, timestamp, and json', async () => {
    const stmt = okStmt();
    const db = createD1(stmt);
    const dao = new CrlDAO(db);

    await dao.insert(3, 1780000000, '{"version":3}');

    expect(prepareCalls(db)[0][0]).toContain('INSERT INTO crl');
    expect(bindCalls(stmt)[0]).toEqual([3, 1780000000, '{"version":3}']);
  });

  it('maps D1 failures to DatabaseError', async () => {
    const db = createD1();
    (db.prepare as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('no such table: crl');
    });
    const dao = new CrlDAO(db);

    await expect(dao.getLatest()).rejects.toThrow(DatabaseError);
    await expect(dao.getLatestVersion()).rejects.toThrow(DatabaseError);
  });
});
