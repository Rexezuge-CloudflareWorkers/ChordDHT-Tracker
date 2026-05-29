import type { NodesResponse, StatsResponse, TrackerNodeRecord } from './types';

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchNodes(limit = 200, token?: string): Promise<NodesResponse> {
  const res = await fetch(`/tracker/nodes?limit=${limit}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.status}`);
  return res.json() as Promise<NodesResponse>;
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch('/tracker/stats');
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json() as Promise<StatsResponse>;
}

export async function fetchNode(nodeId: string, token?: string): Promise<TrackerNodeRecord> {
  const res = await fetch(`/tracker/nodes/${nodeId}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Failed to fetch node: ${res.status}`);
  return res.json() as Promise<TrackerNodeRecord>;
}

export async function verifyAdmin(token: string): Promise<boolean> {
  const res = await fetch('/tracker/admin/verify', { headers: { Authorization: `Bearer ${token}` } });
  return res.ok;
}
