import type { VNodeEntry, VNodeProof } from './VNode';

interface Certificate {
  version: number;
  node_id: string;
  uri: string;
  public_key: string; // base64url raw 32-byte Ed25519 public key
  issued_at: number; // Unix seconds
  expires_at: number; // Unix seconds
  signature: string; // base64url 64-byte CA Ed25519 signature
}

type NodeIdListColumn = string | string[] | null;

interface TrackerNodeRecord {
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
  successor_list: NodeIdListColumn;
  predecessor_list: NodeIdListColumn;
  rtt_samples: string | Record<string, number> | null;
  finger_nodes: NodeIdListColumn;
  vnodes?: VNodeEntry[];
}

type PublicTrackerNodeRecord = Omit<
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

function sanitizeNode(node: TrackerNodeRecord, admin: boolean): TrackerNodeRecord | PublicTrackerNodeRecord {
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

interface NodeInfo {
  node_id: string;
  uri: string;
  certificate?: Certificate;
  // v4.0 vnode fields
  anchor_id?: string;
  vnode_proof?: VNodeProof;
}

export { sanitizeNode };
export type { Certificate, NodeIdListColumn, NodeInfo, PublicTrackerNodeRecord, TrackerNodeRecord };
