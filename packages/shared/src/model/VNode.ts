// VNodeProof is a signed credential proving a vnode belongs to an anchor.
interface VNodeProof {
  vnode_id: string;
  anchor_id: string;
  index: number;
  issued_at: number;
  expires_at: number;
  anchor_pub: string; // base64 std Ed25519 public key (32 bytes)
  signature: string; // base64 std Ed25519 signature (64 bytes)
}

// VNodeEntry is a lightweight vnode descriptor in an anchor's NodeInfo.
interface VNodeEntry {
  vnode_id: string;
  index: number;
  status?: string;
  proof?: VNodeProof;
}

interface HeartbeatBody {
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
  // Batched per-vnode snapshots carried by the anchor heartbeat (Option B).
  // Each item is a vnode heartbeat with identical semantics to a direct
  // POST /tracker/nodes/:vnode_id/heartbeat. Absent for anchor-only nodes
  // and old clients; ignored by old trackers.
  vnode_heartbeats?: VNodeHeartbeatBody[];
  // Client's current CRL version (0 = none). Sent only by clients that want
  // inline CRL updates; absent for old clients and clients with CRL refresh
  // disabled. Old trackers ignore it.
  crl_version?: number;
}

// VNodeHeartbeatBody is one vnode snapshot inside an anchor heartbeat batch.
type VNodeHeartbeatBody = HeartbeatBody & {
  vnode_id: string;
};

export type { HeartbeatBody, VNodeEntry, VNodeHeartbeatBody, VNodeProof };
