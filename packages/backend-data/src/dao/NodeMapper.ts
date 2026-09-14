import { DatabaseError } from '@chord-dht-tracker/backend-errors';
import { isD1ErrorRetryable } from '../utils';

interface CountRow {
  count: number;
}

interface SeedRow {
  node_id: string;
  uri: string;
  cert_json?: string | null;
}

interface StableBaseRow {
  node_id: string;
  uri: string;
  status: string;
  last_seen: string;
}

interface StatsSummaryRow {
  total_nodes: number;
  active_nodes: number | null;
  isolated_nodes: number | null;
  leaving_nodes: number | null;
  stale_nodes: number | null;
  avg_finger_table_coverage: number | null;
  avg_uptime_seconds: number | null;
  oldest_node_joined_at: string | number | null;
  newest_node_joined_at: string | number | null;
  expiring_cert_nodes: number | null;
  active_maintenance_nodes: number | null;
  avg_cache_hit_rate: number | null;
}

interface ListAnchorsOptions {
  status?: string;
  region?: string;
  limit: number;
  offset: number;
}

interface CountAnchorsOptions {
  status?: string;
  region?: string;
}

interface ListSeedsOptions {
  cutoffIso: string;
  excludeIds?: string[];
  count: number;
  includeCert: boolean;
}

interface RegisterAnchorInput {
  nodeId: string;
  uri: string;
  joinedAtIso: string;
  lastSeenIso: string;
  certJson: string | null;
  certExpiresAt: number | null;
  region: string | null;
}

function toDatabaseError(error: unknown, context: string): DatabaseError {
  if (error instanceof DatabaseError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new DatabaseError(`Failed to ${context}: ${message}`, isD1ErrorRetryable(message));
}

function mapRegionRows(rows: Array<{ region: string; count: number }>): Record<string, number> {
  const regions: Record<string, number> = {};
  for (const row of rows) {
    regions[row.region] = row.count;
  }
  return regions;
}

export { mapRegionRows, toDatabaseError };
export type {
  CountAnchorsOptions,
  CountRow,
  ListAnchorsOptions,
  ListSeedsOptions,
  RegisterAnchorInput,
  SeedRow,
  StableBaseRow,
  StatsSummaryRow,
};
