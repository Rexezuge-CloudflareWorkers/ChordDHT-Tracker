export interface TrackerNodeRecord {
  node_id: string;
  uri: string | null;
  status: string | null;
  joined_at: string | null;
  last_seen: string | null;
  report_count: number | null;
  successor_id: string | null;
  predecessor_id: string | null;
  successor_list_size: number | null;
  successor_list_capacity: number | null;
  finger_table_coverage: number | null;
  uptime_seconds: number | null;
  maintenance_cycles: number | null;
  cert_json: string | null;
  cert_expires_at: number | null;
  region: string | null;
  maintenance_mode: string | null;
  cache_hits: number | null;
  cache_misses: number | null;
  cache_size: number | null;
  predecessor_list_size: number | null;
  successor_list: string[] | null;
  predecessor_list: string[] | null;
  rtt_samples: Record<string, number> | null;
  finger_nodes: string[] | null;
}

export interface RegionsResponse {
  regions: Record<string, number>;
}

export interface StatsResponse {
  total_nodes: number;
  active_nodes: number;
  isolated_nodes: number;
  leaving_nodes: number;
  stale_nodes: number;
  avg_finger_table_coverage: number | null;
  avg_uptime_seconds: number | null;
  oldest_node_joined_at: string | null;
  newest_node_joined_at: string | null;
  tracker_uptime_seconds: number;
  stale_threshold_seconds: number;
  stats_generated_at: string;
  active_maintenance_nodes: number;
  avg_cache_hit_rate: number | null;
}

export interface NodesResponse {
  nodes: TrackerNodeRecord[];
  total: number;
  limit: number;
  offset: number;
}
