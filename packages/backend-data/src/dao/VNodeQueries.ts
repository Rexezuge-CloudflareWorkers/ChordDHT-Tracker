import type { HeartbeatBody, VNodeHeartbeatBody } from '@chord-dht-tracker/shared';
import type { UpsertVNodeInput } from './VNodeMapper';

const logicalVNodeSelect = `
  SELECT
    v.vnode_id,
    v.anchor_id,
    v.vnode_index,
    v.status,
    v.last_seen,
    v.joined_at,
    v.report_count,
    v.successor_id,
    v.predecessor_id,
    v.successor_list_size,
    v.successor_list_capacity,
    v.finger_table_coverage,
    v.uptime_seconds,
    v.maintenance_cycles,
    v.maintenance_mode,
    v.cache_hits,
    v.cache_misses,
    v.cache_size,
    v.predecessor_list_size,
    v.successor_list,
    v.predecessor_list,
    v.rtt_samples,
    v.finger_nodes,
    a.uri AS anchor_uri,
    a.joined_at AS anchor_joined_at,
    a.last_seen AS anchor_last_seen,
    a.region AS anchor_region
  FROM vnodes v
  INNER JOIN nodes a ON a.node_id = v.anchor_id`;

const UPSERT_VNODE_SQL = `INSERT INTO vnodes (vnode_id, anchor_id, vnode_index, proof_json, status, last_seen, joined_at)
             VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
             ON CONFLICT(vnode_id) DO UPDATE SET
               anchor_id = excluded.anchor_id,
               vnode_index = excluded.vnode_index,
               proof_json = excluded.proof_json,
               status = 'ACTIVE',
               last_seen = excluded.last_seen`;
const DELETE_VNODE_BY_ID_SQL = 'DELETE FROM vnodes WHERE vnode_id = ?';
const DELETE_VNODES_BY_ANCHOR_SQL = 'DELETE FROM vnodes WHERE anchor_id = ?';
const LIST_VNODES_BY_ANCHOR_SQL =
  'SELECT vnode_id, vnode_index, status FROM vnodes WHERE anchor_id = ? ORDER BY vnode_index';
const LIST_VNODE_IDS_BY_ANCHOR_SQL = 'SELECT vnode_id FROM vnodes WHERE anchor_id = ?';
const FIND_VNODE_OWNER_SQL = 'SELECT vnode_id FROM vnodes WHERE vnode_id = ? AND anchor_id != ?';
const FIND_NODE_BY_ID_SQL = 'SELECT node_id FROM nodes WHERE node_id = ?';
const COUNT_VNODES_BY_ANCHOR_SQL = 'SELECT COUNT(*) as count FROM vnodes WHERE anchor_id = ?';
const FIND_ANCHOR_ID_BY_VNODE_SQL = 'SELECT anchor_id FROM vnodes WHERE vnode_id = ?';
const HEARTBEAT_VNODE_DIRECT_SQL = `UPDATE vnodes SET
               last_seen               = ?,
               status                  = COALESCE(?, status),
               successor_id            = ?,
               predecessor_id          = ?,
               successor_list_size     = ?,
               successor_list_capacity = ?,
               finger_table_coverage   = ?,
               uptime_seconds          = ?,
               maintenance_cycles      = ?,
               maintenance_mode        = COALESCE(?, maintenance_mode),
               cache_hits              = ?,
               cache_misses            = ?,
               cache_size              = ?,
               predecessor_list_size   = ?,
               successor_list          = ?,
               predecessor_list        = ?,
               rtt_samples             = ?,
               finger_nodes            = ?,
               report_count            = report_count + 1
             WHERE vnode_id = ?`;
const HEARTBEAT_VNODE_BATCHED_SQL = `${HEARTBEAT_VNODE_DIRECT_SQL} AND anchor_id = ?`;
const STATS_VNODES_SQL = `SELECT
             COUNT(*)                                              AS total_nodes,
             SUM(CASE WHEN status = 'ACTIVE'   THEN 1 ELSE 0 END) AS active_nodes,
             SUM(CASE WHEN status = 'ISOLATED' THEN 1 ELSE 0 END) AS isolated_nodes,
             SUM(CASE WHEN status = 'LEAVING'  THEN 1 ELSE 0 END) AS leaving_nodes,
             SUM(CASE WHEN last_seen < ?       THEN 1 ELSE 0 END) AS stale_nodes,
             AVG(finger_table_coverage)                            AS avg_finger_table_coverage,
             AVG(uptime_seconds)                                   AS avg_uptime_seconds,
             MIN(joined_at)                                        AS oldest_node_joined_at,
             MAX(joined_at)                                        AS newest_node_joined_at,
             0                                                     AS expiring_cert_nodes,
             SUM(CASE WHEN maintenance_mode = 'ACTIVE_MAINTENANCE' THEN 1 ELSE 0 END) AS active_maintenance_nodes,
             AVG(CASE WHEN cache_hits + cache_misses > 0
                      THEN CAST(cache_hits AS REAL) / (cache_hits + cache_misses)
                      ELSE NULL END)                               AS avg_cache_hit_rate
           FROM vnodes`;
const DELETE_STALE_VNODES_SQL = 'DELETE FROM vnodes WHERE last_seen < ?';
const DELETE_ORPHAN_VNODES_SQL = 'DELETE FROM vnodes WHERE anchor_id NOT IN (SELECT node_id FROM nodes)';

function buildUpsertVnodeBindings(input: UpsertVNodeInput): Array<string | number> {
  return [input.vnodeId, input.anchorId, input.vnodeIndex, input.proofJson, input.nowUnix, input.nowUnix];
}

function stringifyIfPresent(value: unknown): string | null {
  return value ? JSON.stringify(value) : null;
}

function buildDirectHeartbeatBindings(
  body: HeartbeatBody,
  nowUnix: number,
  vnodeId: string,
): Array<string | number | null> {
  return [
    nowUnix,
    body.status ?? null,
    body.successor_id ?? null,
    body.predecessor_id ?? null,
    body.successor_list_size ?? null,
    body.successor_list_capacity ?? null,
    body.finger_table_coverage ?? null,
    body.uptime_seconds ?? null,
    body.maintenance_cycles ?? null,
    body.maintenance_mode ?? null,
    body.cache_hits ?? null,
    body.cache_misses ?? null,
    body.cache_size ?? null,
    body.predecessor_list_size ?? null,
    stringifyIfPresent(body.successor_list),
    stringifyIfPresent(body.predecessor_list),
    stringifyIfPresent(body.rtt_samples),
    stringifyIfPresent(body.finger_nodes),
    vnodeId,
  ];
}

function buildBatchedHeartbeatBindings(
  item: VNodeHeartbeatBody,
  nowUnix: number,
  vnodeId: string,
  anchorId: string,
): Array<string | number | null> {
  return [...buildDirectHeartbeatBindings(item, nowUnix, vnodeId), anchorId];
}

function buildLogicalByAnchorsQuery(chunk: string[]): { sql: string; bindings: string[] } {
  const placeholders = chunk.map(() => '?').join(', ');
  return {
    sql: `${logicalVNodeSelect}\n               WHERE v.anchor_id IN (${placeholders})\n               ORDER BY v.last_seen DESC`,
    bindings: [...chunk],
  };
}

function buildFindLogicalByIdQuery(): string {
  return `${logicalVNodeSelect}\n           WHERE v.vnode_id = ?`;
}

export {
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
  logicalVNodeSelect,
  STATS_VNODES_SQL,
  UPSERT_VNODE_SQL,
};
