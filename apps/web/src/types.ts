export interface TrackerNodeRecord {
  node_id: string;
  uri: string | null;
  status: string;
  joined_at: string;
  last_seen: string;
  report_count: number;
  successor_id: string | null;
  predecessor_id: string | null;
  successor_list_size: number | null;
  finger_table_coverage: number | null;
  uptime_seconds: number | null;
  maintenance_cycles: number | null;
  cert_json: string | null;
  cert_expires_at: number | null;
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
  stats_generated_at: string;
}

export interface NodesResponse {
  nodes: TrackerNodeRecord[];
  total: number;
  limit: number;
  offset: number;
}
