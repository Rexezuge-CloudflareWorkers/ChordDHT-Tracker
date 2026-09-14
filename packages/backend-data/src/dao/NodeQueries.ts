import type { HeartbeatBody } from '@chord-dht-tracker/shared';
import type { CountAnchorsOptions, ListAnchorsOptions, ListSeedsOptions, RegisterAnchorInput } from './NodeMapper';

const FIND_ANCHOR_BY_ID_SQL = 'SELECT * FROM nodes WHERE node_id = ?';
const ANCHOR_EXISTS_SQL = 'SELECT node_id FROM nodes WHERE node_id = ?';
const GET_ANCHOR_CERT_SQL = 'SELECT cert_json FROM nodes WHERE node_id = ?';
const REGISTER_ANCHOR_SQL = `INSERT INTO nodes (node_id, uri, joined_at, last_seen, cert_json, cert_expires_at, region)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(node_id) DO UPDATE SET
               uri = excluded.uri,
               last_seen = excluded.last_seen,
               cert_json = COALESCE(excluded.cert_json, cert_json),
               cert_expires_at = COALESCE(excluded.cert_expires_at, cert_expires_at),
               region = COALESCE(excluded.region, region)`;
const HEARTBEAT_ANCHOR_SQL = `UPDATE nodes SET
               last_seen             = ?,
               status                = COALESCE(?, status),
               successor_id          = ?,
               predecessor_id        = ?,
               successor_list_size   = ?,
               successor_list_capacity = ?,
               finger_table_coverage = ?,
               uptime_seconds        = ?,
               maintenance_cycles    = ?,
               cert_expires_at       = COALESCE(?, cert_expires_at),
               region                = COALESCE(?, region),
               maintenance_mode      = COALESCE(?, maintenance_mode),
               cache_hits            = ?,
               cache_misses          = ?,
               cache_size            = ?,
               predecessor_list_size = ?,
               successor_list        = ?,
               predecessor_list      = ?,
               rtt_samples           = ?,
               finger_nodes          = ?,
               report_count          = report_count + 1
             WHERE node_id = ?`;
const COUNT_ALL_SQL = 'SELECT COUNT(*) as count FROM nodes';
const DELETE_ANCHOR_SQL = 'DELETE FROM nodes WHERE node_id = ?';
const STATS_ANCHORS_SQL = `SELECT
             COUNT(*)                                              AS total_nodes,
             SUM(CASE WHEN status = 'ACTIVE'   THEN 1 ELSE 0 END) AS active_nodes,
             SUM(CASE WHEN status = 'ISOLATED' THEN 1 ELSE 0 END) AS isolated_nodes,
             SUM(CASE WHEN status = 'LEAVING'  THEN 1 ELSE 0 END) AS leaving_nodes,
             SUM(CASE WHEN last_seen < ?       THEN 1 ELSE 0 END) AS stale_nodes,
             AVG(finger_table_coverage)                            AS avg_finger_table_coverage,
             AVG(uptime_seconds)                                   AS avg_uptime_seconds,
             MIN(joined_at)                                        AS oldest_node_joined_at,
             MAX(joined_at)                                        AS newest_node_joined_at,
             SUM(CASE WHEN cert_expires_at IS NOT NULL AND cert_expires_at <= ? THEN 1 ELSE 0 END) AS expiring_cert_nodes,
             SUM(CASE WHEN maintenance_mode = 'ACTIVE_MAINTENANCE' THEN 1 ELSE 0 END) AS active_maintenance_nodes,
             AVG(CASE WHEN cache_hits + cache_misses > 0
                      THEN CAST(cache_hits AS REAL) / (cache_hits + cache_misses)
                      ELSE NULL END)                               AS avg_cache_hit_rate
           FROM nodes`;
const REGION_COUNTS_SQL = `SELECT region, COUNT(*) as count
             FROM nodes
             WHERE region IS NOT NULL
             GROUP BY region
             ORDER BY count DESC`;
const SET_VNODE_COUNT_SQL = 'UPDATE nodes SET vnode_count = ? WHERE node_id = ?';
const EVICT_OLDEST_ANCHORS_SQL =
  'DELETE FROM nodes WHERE node_id IN (SELECT node_id FROM nodes ORDER BY last_seen ASC LIMIT ?)';
const DELETE_STALE_ANCHORS_SQL = 'DELETE FROM nodes WHERE last_seen < ?';
const RECOUNT_VNODE_COUNTS_SQL =
  'UPDATE nodes SET vnode_count = (SELECT COUNT(*) FROM vnodes WHERE vnodes.anchor_id = nodes.node_id)';

function buildListAnchorsQuery(options: ListAnchorsOptions): { sql: string; bindings: Array<string | number> } {
  const { status, region, limit, offset } = options;
  if (status && region) {
    return {
      sql: 'SELECT * FROM nodes WHERE status = ? AND region = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
      bindings: [status, region, limit, offset],
    };
  }
  if (status) {
    return {
      sql: 'SELECT * FROM nodes WHERE status = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
      bindings: [status, limit, offset],
    };
  }
  if (region) {
    return {
      sql: 'SELECT * FROM nodes WHERE region = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
      bindings: [region, limit, offset],
    };
  }
  return { sql: 'SELECT * FROM nodes ORDER BY last_seen DESC LIMIT ? OFFSET ?', bindings: [limit, offset] };
}

function buildCountAnchorsQuery(options: CountAnchorsOptions): { sql: string; bindings: Array<string> } {
  const { status, region } = options;
  if (status && region) {
    return { sql: 'SELECT COUNT(*) as count FROM nodes WHERE status = ? AND region = ?', bindings: [status, region] };
  }
  if (status) {
    return { sql: 'SELECT COUNT(*) as count FROM nodes WHERE status = ?', bindings: [status] };
  }
  if (region) {
    return { sql: 'SELECT COUNT(*) as count FROM nodes WHERE region = ?', bindings: [region] };
  }
  return { sql: COUNT_ALL_SQL, bindings: [] };
}

function buildListSeedsQuery(options: ListSeedsOptions): { sql: string; bindings: Array<string | number> } {
  const { cutoffIso, excludeIds = [], count } = options;
  const selectCols = options.includeCert ? 'node_id, uri, cert_json' : 'node_id, uri';
  if (excludeIds.length > 0) {
    const placeholders = excludeIds.map(() => '?').join(', ');
    return {
      sql: `SELECT ${selectCols} FROM nodes WHERE last_seen >= ? AND node_id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT ?`,
      bindings: [cutoffIso, ...excludeIds, count],
    };
  }
  return {
    sql: `SELECT ${selectCols} FROM nodes WHERE last_seen >= ? ORDER BY RANDOM() LIMIT ?`,
    bindings: [cutoffIso, count],
  };
}

function buildStableBaseLookupQuery(nodeIds: string[]): { sql: string; bindings: string[] } {
  const placeholders = nodeIds.map(() => '?').join(', ');
  return {
    sql: `SELECT node_id, uri, status, last_seen FROM nodes WHERE node_id IN (${placeholders})`,
    bindings: [...nodeIds],
  };
}

function buildRegisterAnchorBindings(input: RegisterAnchorInput): Array<string | number | null> {
  return [input.nodeId, input.uri, input.joinedAtIso, input.lastSeenIso, input.certJson, input.certExpiresAt, input.region];
}

function buildHeartbeatAnchorBindings(
  body: HeartbeatBody,
  nowIso: string,
  nodeId: string,
): Array<string | number | null> {
  return [
    nowIso,
    body.status ?? null,
    body.successor_id ?? null,
    body.predecessor_id ?? null,
    body.successor_list_size ?? null,
    body.successor_list_capacity ?? null,
    body.finger_table_coverage ?? null,
    body.uptime_seconds ?? null,
    body.maintenance_cycles ?? null,
    body.cert_expires_at ?? null,
    body.region ?? null,
    body.maintenance_mode ?? null,
    body.cache_hits ?? null,
    body.cache_misses ?? null,
    body.cache_size ?? null,
    body.predecessor_list_size ?? null,
    body.successor_list ? JSON.stringify(body.successor_list) : null,
    body.predecessor_list ? JSON.stringify(body.predecessor_list) : null,
    body.rtt_samples ? JSON.stringify(body.rtt_samples) : null,
    body.finger_nodes ? JSON.stringify(body.finger_nodes) : null,
    nodeId,
  ];
}

export {
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
};
