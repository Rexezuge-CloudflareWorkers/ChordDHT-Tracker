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
  vnode_count: number | null;
  is_vnode?: boolean;
  anchor_id?: string | null;
  vnode_index?: number | null;
  uri: string;
  status: string;
  joined_at: string;
  last_seen: string;
  report_count: number;
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
  successor_list: string | string[] | null;
  predecessor_list: string | string[] | null;
  rtt_samples: string | Record<string, number> | null;
  finger_nodes: string | string[] | null;
  vnodes?: VNodeEntry[];
}

export type PublicTrackerNodeRecord = Omit<
  TrackerNodeRecord,
  | 'status'
  | 'uri'
  | 'joined_at'
  | 'last_seen'
  | 'report_count'
  | 'cert_expires_at'
  | 'successor_id'
  | 'predecessor_id'
  | 'cert_json'
  | 'successor_list_size'
  | 'successor_list_capacity'
  | 'finger_table_coverage'
  | 'uptime_seconds'
  | 'maintenance_cycles'
  | 'region'
  | 'maintenance_mode'
  | 'cache_hits'
  | 'cache_misses'
  | 'cache_size'
  | 'predecessor_list_size'
  | 'successor_list'
  | 'predecessor_list'
  | 'rtt_samples'
  | 'finger_nodes'
  | 'vnode_count'
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
  successor_list_capacity: null;
  finger_table_coverage: null;
  uptime_seconds: null;
  maintenance_cycles: null;
  region: null;
  maintenance_mode: null;
  cache_hits: null;
  cache_misses: null;
  cache_size: null;
  predecessor_list_size: null;
  successor_list: null;
  predecessor_list: null;
  rtt_samples: null;
  finger_nodes: null;
  vnode_count: null;
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
    successor_list_capacity: null,
    finger_table_coverage: null,
    uptime_seconds: null,
    maintenance_cycles: null,
    maintenance_mode: null,
    cache_hits: null,
    cache_misses: null,
    cache_size: null,
    predecessor_list_size: null,
    successor_list: null,
    predecessor_list: null,
    rtt_samples: null,
    finger_nodes: null,
    vnode_count: null,
  };
}

export interface NodeInfo {
  node_id: string;
  uri: string;
  certificate?: Certificate;
  // v4.0 vnode fields
  anchor_id?: string;
  vnode_proof?: VNodeProof;
}

// VNodeProof is a signed credential proving a vnode belongs to an anchor.
export interface VNodeProof {
  vnode_id: string;
  anchor_id: string;
  index: number;
  issued_at: number;
  expires_at: number;
  anchor_pub: string; // base64 std Ed25519 public key (32 bytes)
  signature: string;  // base64 std Ed25519 signature (64 bytes)
}

// VNodeEntry is a lightweight vnode descriptor in an anchor's NodeInfo.
export interface VNodeEntry {
  vnode_id: string;
  index: number;
  status?: string;
  proof?: VNodeProof;
}

export interface HeartbeatBody {
  status?: string;
  successor_id?: string | null;
  predecessor_id?: string | null;
  successor_list_size?: number;
  successor_list_capacity?: number;
  finger_table_coverage?: number;
  uptime_seconds?: number;
  maintenance_cycles?: number;
  cert_expires_at?: number | null;
  region?: string | null;
  maintenance_mode?: string;
  cache_hits?: number;
  cache_misses?: number;
  cache_size?: number;
  predecessor_list_size?: number;
  successor_list?: string[];
  predecessor_list?: string[];
  rtt_samples?: Record<string, number>;
  finger_nodes?: string[];
}
