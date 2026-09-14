import { NODE_ID_PATTERN } from '@chord-dht-tracker/shared';
import type { HeartbeatBody, TrackerNodeRecord, VNodeEntry, VNodeHeartbeatBody } from '@chord-dht-tracker/shared';
import { VNODE_ANCHOR_CHUNK_SIZE } from '../constants';
import { executeD1WithRetry } from '../utils';
import { BaseDAO } from './BaseDAO';
import type { StatsSummaryRow } from './NodeMapper';
import type { LogicalVNodeRow, UpsertVNodeInput, VNodeBatchedHeartbeatResult } from './VNodeMapper';
import { logicalVNodeFromRow,  toDatabaseError } from './VNodeMapper';
import {
  buildBatchedHeartbeatBindings,
  buildDirectHeartbeatBindings,
  buildFindLogicalByIdQuery,
  buildLogicalByAnchorsQuery,
  buildUpsertVnodeBindings,
  COUNT_VNODES_BY_ANCHOR_SQL,
  DELETE_ORPHAN_VNODES_SQL,
  DELETE_STALE_VNODES_SQL,
  DELETE_VNODE_BY_ID_SQL,
  DELETE_VNODES_BY_ANCHOR_SQL,
  FIND_ANCHOR_ID_BY_VNODE_SQL,
  FIND_NODE_BY_ID_SQL,
  FIND_VNODE_OWNER_SQL,
  HEARTBEAT_VNODE_BATCHED_SQL,
  HEARTBEAT_VNODE_DIRECT_SQL,
  LIST_VNODE_IDS_BY_ANCHOR_SQL,
  LIST_VNODES_BY_ANCHOR_SQL,
  STATS_VNODES_SQL,
  UPSERT_VNODE_SQL,
} from './VNodeQueries';

// VNodeDAO owns the `vnodes` table (SQL moved from apps/api/src/db.ts).
class VNodeDAO extends BaseDAO {
  public async upsert(input: UpsertVNodeInput): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> => this.database.prepare(UPSERT_VNODE_SQL).bind(...buildUpsertVnodeBindings(input)).run(),
      'upsert vnode',
    );
  }

  public async deleteById(vnodeId: string): Promise<number> {
    const result = await executeD1WithRetry(
      (): Promise<D1Result> => this.database.prepare(DELETE_VNODE_BY_ID_SQL).bind(vnodeId).run(),
      'delete vnode by id',
    );
    return result.meta.changes ?? 0;
  }

  public async deleteByAnchor(anchorId: string): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> => this.database.prepare(DELETE_VNODES_BY_ANCHOR_SQL).bind(anchorId).run(),
      'delete vnodes by anchor',
    );
  }

  public async listByAnchor(anchorId: string): Promise<VNodeEntry[]> {
    const result = await this.withRetry(
      (): Promise<D1Result> => this.database.prepare(LIST_VNODES_BY_ANCHOR_SQL).bind(anchorId).all(),
      'list vnodes by anchor',
    );
    return ((result.results ?? []) as Array<{ vnode_id: string; vnode_index: number; status: string }>).map((r) => ({
      vnode_id: r.vnode_id,
      index: r.vnode_index,
      status: r.status,
    }));
  }

  public async listIdsByAnchor(anchorId: string): Promise<string[]> {
    const result = await this.withRetry(
      (): Promise<D1Result> => this.database.prepare(LIST_VNODE_IDS_BY_ANCHOR_SQL).bind(anchorId).all(),
      'list vnode ids by anchor',
    );
    return ((result.results ?? []) as Array<{ vnode_id: string }>).map((r) => r.vnode_id);
  }

  public async listLogicalByAnchors(anchorIDs: string[]): Promise<TrackerNodeRecord[]> {
    if (anchorIDs.length === 0) return [];
    const out: TrackerNodeRecord[] = [];
    for (let i = 0; i < anchorIDs.length; i += VNODE_ANCHOR_CHUNK_SIZE) {
      const { sql, bindings } = buildLogicalByAnchorsQuery(anchorIDs.slice(i, i + VNODE_ANCHOR_CHUNK_SIZE));
      const result = await this.withRetry(
        (): Promise<D1Result> => this.database.prepare(sql).bind(...bindings).all(),
        'list logical vnodes by anchors',
      );
      out.push(...((result.results ?? []) as LogicalVNodeRow[]).map(logicalVNodeFromRow));
    }
    return out;
  }

  public async findLogicalById(vnodeID: string): Promise<TrackerNodeRecord | null> {
    try {
      const row = await this.database.prepare(buildFindLogicalByIdQuery()).bind(vnodeID).first<LogicalVNodeRow>();
      return row ? logicalVNodeFromRow(row) : null;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'find logical vnode by id');
    }
  }

  public async existsUnderDifferentAnchor(vnodeId: string, anchorId: string): Promise<boolean> {
    try {
      const row = await this.database.prepare(FIND_VNODE_OWNER_SQL).bind(vnodeId, anchorId).first<{ vnode_id: string }>();
      return row !== null;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'check vnode ownership');
    }
  }

  public async checkCollision(vnodeID: string, anchorID: string): Promise<boolean> {
    if (await this.existsUnderDifferentAnchor(vnodeID, anchorID)) return true;
    try {
      return !!(await this.database.prepare(FIND_NODE_BY_ID_SQL).bind(vnodeID).first<{ node_id: string }>());
    } catch (error: unknown) {
      throw toDatabaseError(error, 'check vnode id collision');
    }
  }

  public async countByAnchor(anchorId: string): Promise<number> {
    try {
      const row = await this.database.prepare(COUNT_VNODES_BY_ANCHOR_SQL).bind(anchorId).first<{ count: number }>();
      return row?.count ?? 0;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'count vnodes by anchor');
    }
  }

  public async findAnchorIdByVnodeId(vnodeId: string): Promise<string | null> {
    try {
      const row = await this.database.prepare(FIND_ANCHOR_ID_BY_VNODE_SQL).bind(vnodeId).first<{ anchor_id: string }>();
      return row?.anchor_id ?? null;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'find anchor id by vnode id');
    }
  }

  public async heartbeatDirect(vnodeId: string, body: HeartbeatBody, nowUnix: number): Promise<number> {
    const result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database.prepare(HEARTBEAT_VNODE_DIRECT_SQL).bind(...buildDirectHeartbeatBindings(body, nowUnix, vnodeId)).run(),
      'heartbeat vnode directly',
    );
    return result.meta.changes ?? 0;
  }

  public async heartbeatBatched(anchorId: string, items: VNodeHeartbeatBody[], nowUnix: number): Promise<VNodeBatchedHeartbeatResult> {
    const ownedSet = new Set(await this.listIdsByAnchor(anchorId));
    let updated = 0;
    const errors: Array<{ vnode_id: string; code: string }> = [];
    for (const item of items) {
      const vnodeId = typeof item?.vnode_id === 'string' ? item.vnode_id : '';
      if (!NODE_ID_PATTERN.test(vnodeId)) {
        errors.push({ vnode_id: vnodeId, code: 'INVALID_REQUEST' });
        continue;
      }
      if (!ownedSet.has(vnodeId)) {
        errors.push({ vnode_id: vnodeId, code: 'UNKNOWN_VNODE' });
        continue;
      }
      const result = await executeD1WithRetry(
        (): Promise<D1Result> =>
          this.database.prepare(HEARTBEAT_VNODE_BATCHED_SQL).bind(...buildBatchedHeartbeatBindings(item, nowUnix, vnodeId, anchorId)).run(),
        'heartbeat vnode in batch',
      );
      if ((result.meta.changes ?? 0) === 0) errors.push({ vnode_id: vnodeId, code: 'UNKNOWN_VNODE' });
      else updated++;
    }
    return { updated, errors };
  }

  public async statsVnodes(staleCutoffUnix: number): Promise<StatsSummaryRow | null> {
    try {
      return await this.database.prepare(STATS_VNODES_SQL).bind(staleCutoffUnix).first<StatsSummaryRow>();
    } catch (error: unknown) {
      throw toDatabaseError(error, 'aggregate vnode stats');
    }
  }

  public async deleteStale(cutoffUnix: number): Promise<number> {
    const result = await executeD1WithRetry(
      (): Promise<D1Result> => this.database.prepare(DELETE_STALE_VNODES_SQL).bind(cutoffUnix).run(),
      'delete stale vnodes',
    );
    return result.meta.changes ?? 0;
  }

  public async deleteOrphans(): Promise<number> {
    const result = await executeD1WithRetry(
      (): Promise<D1Result> => this.database.prepare(DELETE_ORPHAN_VNODES_SQL).run(),
      'delete orphan vnodes',
    );
    return result.meta.changes ?? 0;
  }
}

export { VNodeDAO,  };


export {parseNodeJsonColumns, type LogicalVNodeRow, type UpsertVNodeInput, type VNodeBatchedHeartbeatResult} from './VNodeMapper';