import { describe, expect, it, vi } from 'vitest';
import { cleanupStaleNodes, getStaleCleanupAfterHours } from '@/db';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';

describe('getStaleCleanupAfterHours', () => {
  it('defaults to 24 when unset or invalid', () => {
    const db = createD1();
    expect(getStaleCleanupAfterHours(createEnv(db))).toBe(24);
    expect(getStaleCleanupAfterHours(createEnv(db, true, null, { STALE_CLEANUP_AFTER_HOURS: 'abc' }))).toBe(24);
    expect(getStaleCleanupAfterHours(createEnv(db, true, null, { STALE_CLEANUP_AFTER_HOURS: '0' }))).toBe(24);
    expect(getStaleCleanupAfterHours(createEnv(db, true, null, { STALE_CLEANUP_AFTER_HOURS: '-5' }))).toBe(24);
  });

  it('returns the configured positive value', () => {
    const db = createD1();
    expect(getStaleCleanupAfterHours(createEnv(db, true, null, { STALE_CLEANUP_AFTER_HOURS: '48' }))).toBe(48);
  });
});

describe('cleanupStaleNodes', () => {
  const nowMs = new Date('2026-09-14T12:00:00.000Z').getTime();

  it('deletes stale vnodes/anchors with matching cutoffs and recounts vnode_count', async () => {
    const db = createD1(
      createStmt({ changes: 3 }),
      createStmt({ changes: 2 }),
      createStmt({ changes: 1 }),
      createStmt({ changes: 5 }),
    );

    const summary = await cleanupStaleNodes(db, nowMs, 24);

    expect(summary).toEqual({ deletedAnchors: 2, deletedVnodes: 3, orphanVnodes: 1 });

    const prepare = db.prepare as unknown as ReturnType<typeof vi.fn>;
    expect(prepare).toHaveBeenCalledTimes(4);
    const sqls = prepare.mock.calls.map((call) => call[0] as string);
    expect(sqls[0]).toContain('DELETE FROM vnodes WHERE last_seen < ?');
    expect(sqls[1]).toContain('DELETE FROM nodes WHERE last_seen < ?');
    expect(sqls[2]).toContain('anchor_id NOT IN (SELECT node_id FROM nodes)');
    expect(sqls[3]).toContain('UPDATE nodes SET vnode_count');

    const cutoffUnix = Math.floor(nowMs / 1000) - 24 * 3600;
    const cutoffIso = new Date(cutoffUnix * 1000).toISOString();
    const vnodeStmt = prepare.mock.results[0].value as unknown as { bind: ReturnType<typeof vi.fn> };
    const anchorStmt = prepare.mock.results[1].value as unknown as { bind: ReturnType<typeof vi.fn> };
    expect(vnodeStmt.bind).toHaveBeenCalledWith(cutoffUnix);
    expect(anchorStmt.bind).toHaveBeenCalledWith(cutoffIso);
  });

  it('falls back to 24h for non-positive afterHours', async () => {
    const db = createD1(createStmt({ changes: 0 }), createStmt({ changes: 0 }), createStmt({ changes: 0 }), createStmt());
    const summary = await cleanupStaleNodes(db, nowMs, 0);
    expect(summary).toEqual({ deletedAnchors: 0, deletedVnodes: 0, orphanVnodes: 0 });

    const prepare = db.prepare as unknown as ReturnType<typeof vi.fn>;
    const cutoffUnix = Math.floor(nowMs / 1000) - 24 * 3600;
    const vnodeStmt = prepare.mock.results[0].value as unknown as { bind: ReturnType<typeof vi.fn> };
    expect(vnodeStmt.bind).toHaveBeenCalledWith(cutoffUnix);
  });
});
