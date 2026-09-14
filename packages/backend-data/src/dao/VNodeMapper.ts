import { DatabaseError } from '@chord-dht-tracker/backend-errors';
import type { TrackerNodeRecord } from '@chord-dht-tracker/shared';
import { isD1ErrorRetryable } from '../utils';

interface UpsertVNodeInput {
  vnodeId: string;
  anchorId: string;
  vnodeIndex: number;
  proofJson: string;
  nowUnix: number;
}

interface VNodeBatchedHeartbeatResult {
  updated: number;
  errors: Array<{ vnode_id: string; code: string }>;
}

interface LogicalVNodeRow {
  vnode_id: string;
  anchor_id: string;
  vnode_index: number;
  status: string;
  last_seen: number;
  joined_at: number | null;
  report_count: number | null;
  successor_id: string | null;
  predecessor_id: string | null;
  successor_list_size: number | null;
  successor_list_capacity: number | null;
  finger_table_coverage: number | null;
  uptime_seconds: number | null;
  maintenance_cycles: number | null;
  maintenance_mode: string | null;
  cache_hits: number | null;
  cache_misses: number | null;
  cache_size: number | null;
  predecessor_list_size: number | null;
  successor_list: string | null;
  predecessor_list: string | null;
  rtt_samples: string | null;
  finger_nodes: string | null;
  anchor_uri: string;
  anchor_joined_at: string;
  anchor_last_seen: string;
  anchor_region: string | null;
}

// Parse JSON TEXT columns that are stored as serialized strings in D1.
function parseNodeJsonColumns(node: TrackerNodeRecord): TrackerNodeRecord {
  return {
    ...node,
    successor_list: parseJSONColumn(node.successor_list),
    predecessor_list: parseJSONColumn(node.predecessor_list),
    rtt_samples: parseJSONColumn(node.rtt_samples),
    finger_nodes: parseJSONColumn(node.finger_nodes),
  };
}

function parseJSONColumn<T>(value: string | T | null): T | null {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  return JSON.parse(value) as T;
}

function unixSecondsToISO(value: number | null | undefined, fallback: string): string {
  if (typeof value !== 'number') return fallback;
  return new Date(value * 1000).toISOString();
}

function logicalVNodeFromRow(row: LogicalVNodeRow): TrackerNodeRecord {
  return parseNodeJsonColumns({
    node_id: row.vnode_id,
    vnode_count: 0,
    is_vnode: true,
    anchor_id: row.anchor_id,
    vnode_index: row.vnode_index,
    uri: row.anchor_uri,
    status: row.status,
    joined_at: unixSecondsToISO(row.joined_at, row.anchor_joined_at),
    last_seen: unixSecondsToISO(row.last_seen, row.anchor_last_seen),
    report_count: row.report_count ?? 0,
    successor_id: row.successor_id,
    predecessor_id: row.predecessor_id,
    successor_list_size: row.successor_list_size,
    successor_list_capacity: row.successor_list_capacity,
    finger_table_coverage: row.finger_table_coverage,
    uptime_seconds: row.uptime_seconds,
    maintenance_cycles: row.maintenance_cycles,
    cert_json: null,
    cert_expires_at: null,
    region: row.anchor_region,
    maintenance_mode: row.maintenance_mode,
    cache_hits: row.cache_hits,
    cache_misses: row.cache_misses,
    cache_size: row.cache_size,
    predecessor_list_size: row.predecessor_list_size,
    successor_list: row.successor_list,
    predecessor_list: row.predecessor_list,
    rtt_samples: row.rtt_samples,
    finger_nodes: row.finger_nodes,
  });
}

function toDatabaseError(error: unknown, context: string): DatabaseError {
  if (error instanceof DatabaseError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new DatabaseError(`Failed to ${context}: ${message}`, isD1ErrorRetryable(message));
}

export { logicalVNodeFromRow, parseNodeJsonColumns, toDatabaseError };
export type { LogicalVNodeRow, UpsertVNodeInput, VNodeBatchedHeartbeatResult };
