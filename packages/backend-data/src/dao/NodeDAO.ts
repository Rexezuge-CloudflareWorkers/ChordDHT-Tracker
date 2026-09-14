import type { HeartbeatBody, TrackerNodeRecord } from '@chord-dht-tracker/shared';
import { executeD1WithRetry } from '../utils';
import { BaseDAO } from './BaseDAO';
import type { CountAnchorsOptions, CountRow, ListAnchorsOptions, ListSeedsOptions, RegisterAnchorInput, SeedRow, StableBaseRow, StatsSummaryRow } from './NodeMapper';
import { mapRegionRows, toDatabaseError } from './NodeMapper';
import {
  ANCHOR_EXISTS_SQL,
  buildCountAnchorsQuery,
  buildHeartbeatAnchorBindings,
  buildListAnchorsQuery,
  buildListSeedsQuery,
  buildRegisterAnchorBindings,
  buildStableBaseLookupQuery,
  COUNT_ALL_SQL,
  DELETE_ANCHOR_SQL,
  DELETE_STALE_ANCHORS_SQL,
  EVICT_OLDEST_ANCHORS_SQL,
  FIND_ANCHOR_BY_ID_SQL,
  GET_ANCHOR_CERT_SQL,
  HEARTBEAT_ANCHOR_SQL,
  RECOUNT_VNODE_COUNTS_SQL,
  REGION_COUNTS_SQL,
  REGISTER_ANCHOR_SQL,
  SET_VNODE_COUNT_SQL,
  STATS_ANCHORS_SQL,
} from './NodeQueries';

// NodeDAO owns the `nodes` (anchor) table (SQL moved from apps/api/src/db.ts).
class NodeDAO extends BaseDAO {
  public async findAnchorById(nodeId: string): Promise<TrackerNodeRecord | null> {
    try {
      return (await this.database.prepare(FIND_ANCHOR_BY_ID_SQL).bind(nodeId).first<TrackerNodeRecord>()) ?? null;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'find anchor by id');
    }
  }

  public async exists(nodeId: string): Promise<boolean> {
    try {
      const row = await this.database.prepare(ANCHOR_EXISTS_SQL).bind(nodeId).first<{ node_id: string }>();
      return row !== null;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'check anchor existence');
    }
  }

  public async getAnchorCertJson(anchorId: string): Promise<string | null> {
    try {
      const row = await this.database.prepare(GET_ANCHOR_CERT_SQL).bind(anchorId).first<{ cert_json: string | null }>();
      return row?.cert_json ?? null;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'get anchor certificate');
    }
  }

  public async registerAnchor(input: RegisterAnchorInput): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database.prepare(REGISTER_ANCHOR_SQL).bind(...buildRegisterAnchorBindings(input)).run(),
      'register anchor',
    );
  }

  public async heartbeatAnchor(nodeId: string, body: HeartbeatBody, nowIso: string): Promise<number> {
    const result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database.prepare(HEARTBEAT_ANCHOR_SQL).bind(...buildHeartbeatAnchorBindings(body, nowIso, nodeId)).run(),
      'heartbeat anchor',
    );
    return result.meta.changes ?? 0;
  }

  public async listAnchors(options: ListAnchorsOptions): Promise<TrackerNodeRecord[]> {
    const { sql, bindings } = buildListAnchorsQuery(options);
    const result = await this.withRetry(
      (): Promise<D1Result> => this.database.prepare(sql).bind(...bindings).all(),
      'list anchors',
    );
    return (result.results ?? []) as TrackerNodeRecord[];
  }

  public async countAnchors(options: CountAnchorsOptions): Promise<number> {
    const { sql, bindings } = buildCountAnchorsQuery(options);
    try {
      const row = await this.database.prepare(sql).bind(...bindings).first<CountRow>();
      return row?.count ?? 0;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'count anchors');
    }
  }

  public async listSeeds(options: ListSeedsOptions): Promise<SeedRow[]> {
    const { sql, bindings } = buildListSeedsQuery(options);
    const result = await this.withRetry(
      (): Promise<D1Result> => this.database.prepare(sql).bind(...bindings).all(),
      'list seed nodes',
    );
    return (result.results ?? []) as SeedRow[];
  }

  public async countAll(): Promise<number> {
    try {
      const row = await this.database.prepare(COUNT_ALL_SQL).first<CountRow>();
      return row?.count ?? 0;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'count all anchors');
    }
  }

  public async deleteAnchor(nodeId: string): Promise<number> {
    const result = await executeD1WithRetry(
      (): Promise<D1Result> => this.database.prepare(DELETE_ANCHOR_SQL).bind(nodeId).run(),
      'delete anchor',
    );
    return result.meta.changes ?? 0;
  }

  public async statsAnchors(staleCutoffIso: string, certExpiryCutoffUnix: number): Promise<StatsSummaryRow | null> {
    try {
      return await this.database.prepare(STATS_ANCHORS_SQL).bind(staleCutoffIso, certExpiryCutoffUnix).first<StatsSummaryRow>();
    } catch (error: unknown) {
      throw toDatabaseError(error, 'aggregate anchor stats');
    }
  }

  public async regionCounts(): Promise<Record<string, number>> {
    const result = await this.withRetry(
      (): Promise<D1Result> => this.database.prepare(REGION_COUNTS_SQL).all(),
      'count anchors by region',
    );
    return mapRegionRows((result.results ?? []) as Array<{ region: string; count: number }>);
  }

  public async stableBaseLookup(nodeIds: string[]): Promise<StableBaseRow[]> {
    if (nodeIds.length === 0) return [];
    const { sql, bindings } = buildStableBaseLookupQuery(nodeIds);
    const result = await this.withRetry(
      (): Promise<D1Result> => this.database.prepare(sql).bind(...bindings).all(),
      'look up stable-base members',
    );
    return (result.results ?? []) as StableBaseRow[];
  }

  public async setVnodeCount(anchorId: string, count: number): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> => this.database.prepare(SET_VNODE_COUNT_SQL).bind(count, anchorId).run(),
      'set anchor vnode count',
    );
  }

  public async evictOverLimit(maxNodes: number): Promise<void> {
    let count: number;
    try {
      const row = await this.database.prepare(COUNT_ALL_SQL).first<CountRow>();
      count = row?.count ?? 0;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'count anchors for eviction');
    }
    if (count <= maxNodes) return;
    await executeD1WithRetry(
      (): Promise<D1Result> => this.database.prepare(EVICT_OLDEST_ANCHORS_SQL).bind(count - maxNodes).run(),
      'evict oldest anchors over limit',
    );
  }

  public async deleteStaleAnchors(cutoffIso: string): Promise<number> {
    const result = await executeD1WithRetry(
      (): Promise<D1Result> => this.database.prepare(DELETE_STALE_ANCHORS_SQL).bind(cutoffIso).run(),
      'delete stale anchors',
    );
    return result.meta.changes ?? 0;
  }

  public async recountAllVnodeCounts(): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> => this.database.prepare(RECOUNT_VNODE_COUNTS_SQL).run(),
      'recount all anchor vnode counts',
    );
  }
}

export { NodeDAO };


export {type CountAnchorsOptions, type CountRow, type ListAnchorsOptions, type ListSeedsOptions, type RegisterAnchorInput, type SeedRow, type StableBaseRow, type StatsSummaryRow} from './NodeMapper';