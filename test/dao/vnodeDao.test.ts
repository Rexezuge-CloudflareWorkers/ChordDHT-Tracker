import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import { DatabaseError } from '@chord-dht-tracker/backend-errors';
import { createD1 } from '../mocks/d1';
import { okStmt } from './helpers';

const ANCHOR = 'a'.repeat(40);
const VNODE = 'b'.repeat(40);
const OTHER_VNODE = 'c'.repeat(40);

const logicalRow = {
  vnode_id: VNODE,
  anchor_id: ANCHOR,
  vnode_index: 1,
  status: 'ACTIVE',
  last_seen: 1780000000,
  joined_at: 1780000000,
  report_count: 3,
  successor_id: OTHER_VNODE,
  predecessor_id: ANCHOR,
  successor_list_size: 2,
  successor_list_capacity: 5,
  finger_table_coverage: 0.5,
  uptime_seconds: 120,
  maintenance_cycles: 4,
  maintenance_mode: 'ACTIVE_MAINTENANCE',
  cache_hits: 1,
  cache_misses: 2,
  cache_size: 3,
  predecessor_list_size: 1,
  successor_list: JSON.stringify([OTHER_VNODE, ANCHOR]),
  predecessor_list: JSON.stringify([ANCHOR]),
  rtt_samples: JSON.stringify({ [ANCHOR]: 10 }),
  finger_nodes: JSON.stringify([OTHER_VNODE]),
  anchor_uri: 'https://node1.example.com',
  anchor_joined_at: '2026-05-28T00:00:00.000Z',
  anchor_last_seen: '2026-05-28T06:00:00.000Z',
  anchor_region: 'iad',
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

describe('VNodeDAO writes', () => {
  it('upsert binds vnode identity then timestamps', async () => {
    const stmt = okStmt();
    const db = createD1(stmt);
    const dao = new VNodeDAO(db);

    await dao.upsert({ vnodeId: VNODE, anchorId: ANCHOR, vnodeIndex: 2, proofJson: '{"i":2}', nowUnix: 1780000000 });

    expect(prepareCalls(db)[0][0]).toContain('INSERT INTO vnodes');
    const args = bindCalls(stmt)[0];
    expect(args.slice(0, 4)).toEqual([VNODE, ANCHOR, 2, '{"i":2}']);
  });

  it('deleteById returns affected rows', async () => {
    const gone = new VNodeDAO(createD1(okStmt({ changes: 1 })));
    const missing = new VNodeDAO(createD1(okStmt({ changes: 0 })));

    await expect(gone.deleteById(VNODE)).resolves.toBe(1);
    await expect(missing.deleteById(VNODE)).resolves.toBe(0);
  });

  it('deleteByAnchor removes every vnode of the anchor', async () => {
    const stmt = okStmt();
    const db = createD1(stmt);
    const dao = new VNodeDAO(db);

    await dao.deleteByAnchor(ANCHOR);

    expect(prepareCalls(db)[0][0]).toBe('DELETE FROM vnodes WHERE anchor_id = ?');
    expect(bindCalls(stmt)[0]).toEqual([ANCHOR]);
  });

  it('heartbeatDirect returns affected rows and targets the vnode', async () => {
    const stmt = okStmt({ changes: 1 });
    const db = createD1(stmt);
    const dao = new VNodeDAO(db);

    const changes = await dao.heartbeatDirect(VNODE, { status: 'ACTIVE' }, 1780000000);

    expect(changes).toBe(1);
    expect(prepareCalls(db)[0][0]).toContain('UPDATE vnodes SET');
    const args = bindCalls(stmt)[0];
    expect(args[args.length - 1]).toBe(VNODE);
  });
});

describe('VNodeDAO reads', () => {
  it('listByAnchor maps rows to vnode entries', async () => {
    const dao = new VNodeDAO(
      createD1(okStmt({ allResults: [{ vnode_id: VNODE, vnode_index: 1, status: 'ACTIVE' }] })),
    );

    await expect(dao.listByAnchor(ANCHOR)).resolves.toEqual([{ vnode_id: VNODE, index: 1, status: 'ACTIVE' }]);
  });

  it('listIdsByAnchor returns bare vnode ids', async () => {
    const dao = new VNodeDAO(createD1(okStmt({ allResults: [{ vnode_id: VNODE }, { vnode_id: OTHER_VNODE }] })));

    await expect(dao.listIdsByAnchor(ANCHOR)).resolves.toEqual([VNODE, OTHER_VNODE]);
  });

  it('listLogicalByAnchors short-circuits on an empty anchor list', async () => {
    const db = createD1();
    const dao = new VNodeDAO(db);

    await expect(dao.listLogicalByAnchors([])).resolves.toEqual([]);
    expect(db.prepare as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('listLogicalByAnchors expands rows to logical node records', async () => {
    const dao = new VNodeDAO(createD1(okStmt({ allResults: [logicalRow] })));

    const rows = await dao.listLogicalByAnchors([ANCHOR]);

    expect(rows).toHaveLength(1);
    expect(rows[0].node_id).toBe(VNODE);
    expect(rows[0].is_vnode).toBe(true);
    expect(rows[0].uri).toBe('https://node1.example.com');
    expect(rows[0].successor_list).toEqual([OTHER_VNODE, ANCHOR]);
  });

  it('findLogicalById returns the logical record or null', async () => {
    const found = new VNodeDAO(createD1(okStmt({ firstResult: logicalRow })));
    const missing = new VNodeDAO(createD1(okStmt({ firstResult: null })));

    const row = await found.findLogicalById(VNODE);
    expect(row?.node_id).toBe(VNODE);
    await expect(missing.findLogicalById(VNODE)).resolves.toBeNull();
  });

  it('existsUnderDifferentAnchor detects foreign ownership', async () => {
    const owned = new VNodeDAO(createD1(okStmt({ firstResult: { vnode_id: VNODE } })));
    const free = new VNodeDAO(createD1(okStmt({ firstResult: null })));

    await expect(owned.existsUnderDifferentAnchor(VNODE, ANCHOR)).resolves.toBe(true);
    await expect(free.existsUnderDifferentAnchor(VNODE, ANCHOR)).resolves.toBe(false);
  });

  it('checkCollision is true when another anchor owns the id', async () => {
    const stmt = okStmt({ firstResult: { vnode_id: VNODE } });
    const db = createD1(stmt);
    const dao = new VNodeDAO(db);

    await expect(dao.checkCollision(VNODE, ANCHOR)).resolves.toBe(true);
    expect(prepareCalls(db)).toHaveLength(1);
  });

  it('checkCollision falls back to the anchor table', async () => {
    const dao = new VNodeDAO(
      createD1(okStmt({ firstResult: null }), okStmt({ firstResult: { node_id: VNODE } })),
    );

    await expect(dao.checkCollision(VNODE, ANCHOR)).resolves.toBe(true);
  });

  it('checkCollision is false when the id is free', async () => {
    const dao = new VNodeDAO(createD1(okStmt({ firstResult: null }), okStmt({ firstResult: null })));

    await expect(dao.checkCollision(VNODE, ANCHOR)).resolves.toBe(false);
  });

  it('countByAnchor returns zero when the row is missing', async () => {
    const dao = new VNodeDAO(createD1(okStmt({ firstResult: { count: 2 } })));
    const empty = new VNodeDAO(createD1(okStmt({ firstResult: null })));

    await expect(dao.countByAnchor(ANCHOR)).resolves.toBe(2);
    await expect(empty.countByAnchor(ANCHOR)).resolves.toBe(0);
  });

  it('findAnchorIdByVnodeId returns the owner or null', async () => {
    const owned = new VNodeDAO(createD1(okStmt({ firstResult: { anchor_id: ANCHOR } })));
    const missing = new VNodeDAO(createD1(okStmt({ firstResult: null })));

    await expect(owned.findAnchorIdByVnodeId(VNODE)).resolves.toBe(ANCHOR);
    await expect(missing.findAnchorIdByVnodeId(VNODE)).resolves.toBeNull();
  });

  it('statsVnodes binds the unix cutoff', async () => {
    const summary = { total_nodes: 8, active_nodes: 6 };
    const stmt = okStmt({ firstResult: summary });
    const db = createD1(stmt);
    const dao = new VNodeDAO(db);

    await expect(dao.statsVnodes(1780000000)).resolves.toEqual(summary);
    expect(bindCalls(stmt)[0]).toEqual([1780000000]);
  });

  it('maps D1 failures to DatabaseError', async () => {
    const db = createD1();
    (db.prepare as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('no such table: vnodes');
    });
    const dao = new VNodeDAO(db);

    await expect(dao.findLogicalById(VNODE)).rejects.toThrow(DatabaseError);
  });
});

describe('VNodeDAO batched heartbeats', () => {
  it('updates owned vnodes and reports unknown or invalid ids', async () => {
    const idsStmt = okStmt({ allResults: [{ vnode_id: VNODE }] });
    const updateStmt = okStmt({ changes: 1 });
    const db = createD1(idsStmt, updateStmt);
    const dao = new VNodeDAO(db);

    const result = await dao.heartbeatBatched(
      ANCHOR,
      [
        { vnode_id: VNODE, status: 'ACTIVE' },
        { vnode_id: OTHER_VNODE, status: 'ACTIVE' },
        { vnode_id: 'not-an-id', status: 'ACTIVE' },
      ],
      1780000000,
    );

    expect(result.updated).toBe(1);
    expect(result.errors).toEqual([
      { vnode_id: OTHER_VNODE, code: 'UNKNOWN_VNODE' },
      { vnode_id: 'not-an-id', code: 'INVALID_REQUEST' },
    ]);
    // Ownership is enforced per row.
    const updateBindings = bindCalls(updateStmt)[0];
    expect(updateBindings.slice(-2)).toEqual([VNODE, ANCHOR]);
  });

  it('reports a zero-change update as unknown', async () => {
    const db = createD1(okStmt({ allResults: [{ vnode_id: VNODE }] }), okStmt({ changes: 0 }));
    const dao = new VNodeDAO(db);

    const result = await dao.heartbeatBatched(ANCHOR, [{ vnode_id: VNODE }], 1780000000);

    expect(result).toEqual({ updated: 0, errors: [{ vnode_id: VNODE, code: 'UNKNOWN_VNODE' }] });
  });
});

describe('VNodeDAO stale cleanup', () => {
  it('deleteStale binds the unix cutoff', async () => {
    const stmt = okStmt({ changes: 3 });
    const db = createD1(stmt);
    const dao = new VNodeDAO(db);

    await expect(dao.deleteStale(1780000000)).resolves.toBe(3);
    expect(prepareCalls(db)[0][0]).toContain('DELETE FROM vnodes');
    expect(bindCalls(stmt)[0]).toEqual([1780000000]);
  });

  it('deleteOrphans removes vnodes without anchors', async () => {
    const db = createD1(okStmt({ changes: 1 }));
    const dao = new VNodeDAO(db);

    await expect(dao.deleteOrphans()).resolves.toBe(1);
    expect(prepareCalls(db)[0][0]).toContain('DELETE FROM vnodes');
  });
});
