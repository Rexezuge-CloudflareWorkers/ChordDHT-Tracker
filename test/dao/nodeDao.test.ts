import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeDAO } from '@chord-dht-tracker/backend-data/dao';
import { DatabaseError } from '@chord-dht-tracker/backend-errors';
import { createD1 } from '../mocks/d1';
import { okStmt } from './helpers';

const ANCHOR = 'a'.repeat(40);

const anchorRow = {
  node_id: ANCHOR,
  uri: 'https://node1.example.com',
  status: 'ACTIVE',
  joined_at: '2026-05-28T00:00:00.000Z',
  last_seen: '2026-05-28T06:00:00.000Z',
  report_count: 10,
};

function prepareCalls(db: D1Database): string[][] {
  return (db.prepare as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown as string[][];
}

function bindCalls(stmt: D1PreparedStatement): unknown[][] {
  return (stmt.bind as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NodeDAO reads', () => {
  it('findAnchorById returns the row and binds the node id', async () => {
    const stmt = okStmt({ firstResult: anchorRow });
    const db = createD1(stmt);
    const dao = new NodeDAO(db);

    await expect(dao.findAnchorById(ANCHOR)).resolves.toEqual(anchorRow);
    expect(prepareCalls(db)[0][0]).toContain('SELECT * FROM nodes WHERE node_id = ?');
    expect(bindCalls(stmt)[0]).toEqual([ANCHOR]);
  });

  it('findAnchorById returns null when the anchor is missing', async () => {
    const db = createD1(okStmt({ firstResult: null }));
    const dao = new NodeDAO(db);

    await expect(dao.findAnchorById(ANCHOR)).resolves.toBeNull();
  });

  it('exists returns true/false from the existence probe', async () => {
    const present = new NodeDAO(createD1(okStmt({ firstResult: { node_id: ANCHOR } })));
    const missing = new NodeDAO(createD1(okStmt({ firstResult: null })));

    await expect(present.exists(ANCHOR)).resolves.toBe(true);
    await expect(missing.exists(ANCHOR)).resolves.toBe(false);
  });

  it('getAnchorCertJson returns the stored cert json or null', async () => {
    const withCert = new NodeDAO(createD1(okStmt({ firstResult: { cert_json: '{"v":1}' } })));
    const withoutRow = new NodeDAO(createD1(okStmt({ firstResult: null })));
    const nullColumn = new NodeDAO(createD1(okStmt({ firstResult: { cert_json: null } })));

    await expect(withCert.getAnchorCertJson(ANCHOR)).resolves.toBe('{"v":1}');
    await expect(withoutRow.getAnchorCertJson(ANCHOR)).resolves.toBeNull();
    await expect(nullColumn.getAnchorCertJson(ANCHOR)).resolves.toBeNull();
  });

  it('maps D1 failures to DatabaseError', async () => {
    const db = createD1();
    (db.prepare as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('no such table: nodes');
    });
    const dao = new NodeDAO(db);

    await expect(dao.findAnchorById(ANCHOR)).rejects.toThrow(DatabaseError);
    await expect(dao.exists(ANCHOR)).rejects.toThrow(DatabaseError);
    await expect(dao.countAll()).rejects.toThrow(DatabaseError);
  });
});

describe('NodeDAO writes', () => {
  it('registerAnchor binds node fields in order', async () => {
    const stmt = okStmt();
    const db = createD1(stmt);
    const dao = new NodeDAO(db);

    await dao.registerAnchor({
      nodeId: ANCHOR,
      uri: 'https://node1.example.com',
      joinedAtIso: '2026-05-28T00:00:00.000Z',
      lastSeenIso: '2026-05-28T00:00:00.000Z',
      certJson: null,
      certExpiresAt: null,
      region: 'iad',
    });

    expect(prepareCalls(db)[0][0]).toContain('INSERT INTO nodes');
    expect(bindCalls(stmt)[0]).toEqual([
      ANCHOR,
      'https://node1.example.com',
      '2026-05-28T00:00:00.000Z',
      '2026-05-28T00:00:00.000Z',
      null,
      null,
      'iad',
    ]);
  });

  it('heartbeatAnchor returns affected rows and targets the node id last', async () => {
    const stmt = okStmt({ changes: 1 });
    const db = createD1(stmt);
    const dao = new NodeDAO(db);

    const changes = await dao.heartbeatAnchor(ANCHOR, { status: 'ACTIVE' }, '2026-05-28T07:00:00.000Z');

    expect(changes).toBe(1);
    expect(prepareCalls(db)[0][0]).toContain('UPDATE nodes SET');
    const args = bindCalls(stmt)[0];
    expect(args[args.length - 1]).toBe(ANCHOR);
  });

  it('deleteAnchor returns affected rows', async () => {
    const gone = new NodeDAO(createD1(okStmt({ changes: 1 })));
    const missing = new NodeDAO(createD1(okStmt({ changes: 0 })));

    await expect(gone.deleteAnchor(ANCHOR)).resolves.toBe(1);
    await expect(missing.deleteAnchor(ANCHOR)).resolves.toBe(0);
  });

  it('setVnodeCount binds count then anchor id', async () => {
    const stmt = okStmt();
    const db = createD1(stmt);
    const dao = new NodeDAO(db);

    await dao.setVnodeCount(ANCHOR, 3);

    expect(prepareCalls(db)[0][0]).toContain('UPDATE nodes SET vnode_count = ?');
    expect(bindCalls(stmt)[0]).toEqual([3, ANCHOR]);
  });

  it('deleteStaleAnchors binds the cutoff and returns affected rows', async () => {
    const stmt = okStmt({ changes: 4 });
    const db = createD1(stmt);
    const dao = new NodeDAO(db);

    await expect(dao.deleteStaleAnchors('2026-05-27T00:00:00.000Z')).resolves.toBe(4);
    expect(prepareCalls(db)[0][0]).toContain('DELETE FROM nodes WHERE last_seen < ?');
    expect(bindCalls(stmt)[0]).toEqual(['2026-05-27T00:00:00.000Z']);
  });

  it('recountAllVnodeCounts refreshes every anchor vnode count', async () => {
    const db = createD1(okStmt());
    const dao = new NodeDAO(db);

    await dao.recountAllVnodeCounts();

    expect(prepareCalls(db)[0][0]).toContain('vnode_count');
  });
});

describe('NodeDAO listing and aggregates', () => {
  it('listAnchors applies the status filter and pagination', async () => {
    const stmt = okStmt({ allResults: [anchorRow] });
    const db = createD1(stmt);
    const dao = new NodeDAO(db);

    const rows = await dao.listAnchors({ status: 'ACTIVE', limit: 10, offset: 5 });

    expect(rows).toEqual([anchorRow]);
    expect(prepareCalls(db)[0][0]).toContain('WHERE status = ?');
    expect(bindCalls(stmt)[0]).toEqual(['ACTIVE', 10, 5]);
  });

  it('listAnchors without filters selects the full ordered page', async () => {
    const stmt = okStmt({ allResults: [] });
    const db = createD1(stmt);
    const dao = new NodeDAO(db);

    await dao.listAnchors({ limit: 50, offset: 0 });

    expect(prepareCalls(db)[0][0]).toContain('ORDER BY last_seen DESC LIMIT ? OFFSET ?');
    expect(bindCalls(stmt)[0]).toEqual([50, 0]);
  });

  it('countAnchors combines status and region filters', async () => {
    const stmt = okStmt({ firstResult: { count: 2 } });
    const db = createD1(stmt);
    const dao = new NodeDAO(db);

    await expect(dao.countAnchors({ status: 'ACTIVE', region: 'iad' })).resolves.toBe(2);
    expect(prepareCalls(db)[0][0]).toContain('WHERE status = ? AND region = ?');
    expect(bindCalls(stmt)[0]).toEqual(['ACTIVE', 'iad']);
  });

  it('countAnchors returns zero when the row is missing', async () => {
    const dao = new NodeDAO(createD1(okStmt({ firstResult: null })));

    await expect(dao.countAnchors({})).resolves.toBe(0);
  });

  it('listSeeds excludes ids via NOT IN and binds cutoff first', async () => {
    const excluded = 'b'.repeat(40);
    const stmt = okStmt({ allResults: [{ node_id: ANCHOR, uri: 'https://node1.example.com' }] });
    const db = createD1(stmt);
    const dao = new NodeDAO(db);

    const rows = await dao.listSeeds({ cutoffIso: 'cutoff', excludeIds: [excluded], count: 5, includeCert: false });

    expect(rows).toHaveLength(1);
    expect(prepareCalls(db)[0][0]).toContain('NOT IN');
    expect(bindCalls(stmt)[0]).toEqual(['cutoff', excluded, 5]);
  });

  it('listSeeds selects cert_json only when requested', async () => {
    const plainStmt = okStmt({ allResults: [] });
    const plainDb = createD1(plainStmt);
    await new NodeDAO(plainDb).listSeeds({ cutoffIso: 'cutoff', count: 5, includeCert: false });
    expect(prepareCalls(plainDb)[0][0]).not.toContain('cert_json');

    const certStmt = okStmt({ allResults: [] });
    const certDb = createD1(certStmt);
    await new NodeDAO(certDb).listSeeds({ cutoffIso: 'cutoff', count: 5, includeCert: true });
    expect(prepareCalls(certDb)[0][0]).toContain('cert_json');
  });

  it('countAll returns the anchor total', async () => {
    const dao = new NodeDAO(createD1(okStmt({ firstResult: { count: 7 } })));

    await expect(dao.countAll()).resolves.toBe(7);
  });

  it('statsAnchors binds the stale and cert-expiry cutoffs', async () => {
    const summary = { total_nodes: 5, active_nodes: 3 };
    const stmt = okStmt({ firstResult: summary });
    const db = createD1(stmt);
    const dao = new NodeDAO(db);

    await expect(dao.statsAnchors('stale-cutoff', 123)).resolves.toEqual(summary);
    expect(bindCalls(stmt)[0]).toEqual(['stale-cutoff', 123]);
  });

  it('regionCounts maps rows to a region record', async () => {
    const dao = new NodeDAO(
      createD1(okStmt({ allResults: [{ region: 'iad', count: 2 }, { region: 'lhr', count: 1 }] })),
    );

    await expect(dao.regionCounts()).resolves.toEqual({ iad: 2, lhr: 1 });
  });

  it('regionCounts returns an empty record when no regions exist', async () => {
    const dao = new NodeDAO(createD1(okStmt({ allResults: [] })));

    await expect(dao.regionCounts()).resolves.toEqual({});
  });

  it('stableBaseLookup short-circuits on an empty id list', async () => {
    const db = createD1();
    const dao = new NodeDAO(db);

    await expect(dao.stableBaseLookup([])).resolves.toEqual([]);
    expect(db.prepare as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('stableBaseLookup binds member ids and returns rows', async () => {
    const rows = [{ node_id: ANCHOR, uri: 'https://node1.example.com', status: 'ACTIVE', last_seen: 'now' }];
    const stmt = okStmt({ allResults: rows });
    const db = createD1(stmt);
    const dao = new NodeDAO(db);

    await expect(dao.stableBaseLookup([ANCHOR])).resolves.toEqual(rows);
    expect(prepareCalls(db)[0][0]).toContain('IN');
    expect(bindCalls(stmt)[0]).toEqual([ANCHOR]);
  });
});

describe('NodeDAO eviction', () => {
  it('evictOverLimit skips the delete when under the limit', async () => {
    const db = createD1(okStmt({ firstResult: { count: 5 } }));
    const run = db.prepare as unknown as ReturnType<typeof vi.fn>;
    const dao = new NodeDAO(db);

    await dao.evictOverLimit(10);

    expect(run).toHaveBeenCalledTimes(1);
    expect(prepareCalls(db)[0][0]).toContain('COUNT(*)');
  });

  it('evictOverLimit deletes the oldest overflow rows', async () => {
    const countStmt = okStmt({ firstResult: { count: 12 } });
    const deleteStmt = okStmt();
    const db = createD1(countStmt, deleteStmt);
    const dao = new NodeDAO(db);

    await dao.evictOverLimit(10);

    const calls = prepareCalls(db);
    expect(calls).toHaveLength(2);
    expect(calls[1][0]).toContain('ORDER BY last_seen ASC');
    expect(bindCalls(deleteStmt)[0]).toEqual([2]);
  });
});
