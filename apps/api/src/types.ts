export interface TrackerNodeRecord {
  node_id: string;
  uri: string;
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
}

export interface NodeInfo {
  node_id: string;
  uri: string;
}

export interface HeartbeatBody {
  status?: string;
  successor_id?: string | null;
  predecessor_id?: string | null;
  successor_list_size?: number;
  finger_table_coverage?: number;
  uptime_seconds?: number;
  maintenance_cycles?: number;
}
