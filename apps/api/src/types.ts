export interface Certificate {
  version: number;
  node_id: string;
  uri: string;
  public_key: string; // base64url raw 32-byte Ed25519 public key
  issued_at: number; // Unix seconds
  expires_at: number; // Unix seconds
  signature: string; // base64url 64-byte CA Ed25519 signature
}

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
  cert_json: string | null;
  cert_expires_at: number | null;
  region: string | null;
}

export type PublicTrackerNodeRecord = Omit<
  TrackerNodeRecord,
  'status' | 'uri' | 'joined_at' | 'last_seen' | 'report_count' | 'cert_expires_at' |
  'successor_id' | 'predecessor_id' | 'cert_json' |
  'successor_list_size' | 'finger_table_coverage' | 'uptime_seconds' | 'maintenance_cycles' |
  'region'
> & {
  status: null;
  uri: null;
  joined_at: null;
  last_seen: null;
  report_count: null;
  cert_expires_at: null;
  successor_id: null;
  predecessor_id: null;
  cert_json: null;
  successor_list_size: null;
  finger_table_coverage: null;
  uptime_seconds: null;
  maintenance_cycles: null;
  region: null;
};

export function sanitizeNode(node: TrackerNodeRecord, admin: boolean): TrackerNodeRecord | PublicTrackerNodeRecord {
  if (admin) return node;
  return {
    node_id: node.node_id,
    status: null,
    region: null,
    uri: null,
    joined_at: null,
    last_seen: null,
    report_count: null,
    cert_expires_at: null,
    successor_id: null,
    predecessor_id: null,
    cert_json: null,
    successor_list_size: null,
    finger_table_coverage: null,
    uptime_seconds: null,
    maintenance_cycles: null,
  };
}

export interface NodeInfo {
  node_id: string;
  uri: string;
  certificate?: Certificate;
}

export interface HeartbeatBody {
  status?: string;
  successor_id?: string | null;
  predecessor_id?: string | null;
  successor_list_size?: number;
  finger_table_coverage?: number;
  uptime_seconds?: number;
  maintenance_cycles?: number;
  cert_expires_at?: number | null;
  region?: string | null;
}
