import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseDAO, EncryptedDAO } from '@chord-dht-tracker/backend-data/dao';
import type { D1Queryable } from '@chord-dht-tracker/backend-data/utils';
import { createD1, createStmt } from '../mocks/d1';

class TestDAO extends BaseDAO {
  public find(id: string) {
    return this.findRowById<{ node_id: string }>('nodes', 'node_id', id);
  }

  public findColumns(id: string) {
    return this.findRowById<{ node_id: string }>('nodes', 'node_id', id, 'node_id, uri');
  }

  public prune() {
    return this.deleteRowsOlderThan('nodes', 'last_seen', '2026-01-01T00:00:00.000Z', 100, 'node_id');
  }

  public encode(value: unknown) {
    return this.encodeCursor(value);
  }

  public decode<T>(cursor: string | undefined) {
    return this.decodeCursor<T>(cursor);
  }
}

class SecretDAO extends EncryptedDAO {}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BaseDAO.findById', () => {
  it('returns the row and binds the id', async () => {
    const db = createD1(createStmt({ firstResult: { node_id: 'a'.repeat(40) } }));
    const dao = new TestDAO(db as unknown as D1Queryable);
    await expect(dao.find('a'.repeat(40))).resolves.toEqual({ node_id: 'a'.repeat(40) });
    const prepare = db.prepare as unknown as ReturnType<typeof vi.fn>;
    expect(prepare.mock.calls[0][0]).toContain('FROM nodes WHERE node_id = ?');
  });

  it('returns null when missing and supports column lists', async () => {
    const db = createD1(createStmt({ firstResult: null }), createStmt({ firstResult: null }));
    const dao = new TestDAO(db as unknown as D1Queryable);
    await expect(dao.find('b'.repeat(40))).resolves.toBeNull();
    await expect(dao.findColumns('b'.repeat(40))).resolves.toBeNull();
    const prepare = db.prepare as unknown as ReturnType<typeof vi.fn>;
    expect(prepare.mock.calls[1][0]).toContain('SELECT node_id, uri FROM nodes');
  });

  it('rejects unsafe identifiers', async () => {
    const db = createD1();
    const dao = new TestDAO(db as unknown as D1Queryable);
    await expect(
      (dao as unknown as { findRowById: (...args: string[]) => Promise<unknown> }).findRowById('nodes; DROP', 'node_id', 'x'),
    ).rejects.toThrow(/Invalid SQL identifier/);
    await expect(dao.findColumns('x')).resolves.toBeNull();
  });
});

describe('BaseDAO.deleteOlderThan', () => {
  it('deletes in batches and returns the change count', async () => {
    const db = createD1(createStmt({ changes: 7 }));
    const dao = new TestDAO(db as unknown as D1Queryable);
    await expect(dao.prune()).resolves.toBe(7);
    const prepare = db.prepare as unknown as ReturnType<typeof vi.fn>;
    expect(prepare.mock.calls[0][0]).toContain('DELETE FROM nodes');
    expect(prepare.mock.calls[0][0]).toContain('LIMIT ?');
  });

  it('rejects unsafe identifiers', async () => {
    const db = createD1();
    const dao = new TestDAO(db as unknown as D1Queryable);
    await expect(
      (dao as unknown as { deleteRowsOlderThan: (...args: unknown[]) => Promise<unknown> }).deleteRowsOlderThan(
        'nodes',
        'last_seen; DROP',
        0,
        10,
        'node_id',
      ),
    ).rejects.toThrow(/Invalid SQL identifier/);
  });
});

describe('BaseDAO cursor codec', () => {
  it('round-trips through the instance helpers', () => {
    const db = createD1();
    const dao = new TestDAO(db as unknown as D1Queryable);
    const cursor = dao.encode({ offset: 5 });
    expect(dao.decode<{ offset: number }>(cursor)).toEqual({ offset: 5 });
    expect(dao.decode(undefined)).toBeUndefined();
  });
});

describe('EncryptedDAO', () => {
  it('constructs with a master key', () => {
    const db = createD1();
    const dao = new SecretDAO(db as unknown as D1Queryable, 'master-key');
    expect(dao).toBeInstanceOf(BaseDAO);
  });
});
