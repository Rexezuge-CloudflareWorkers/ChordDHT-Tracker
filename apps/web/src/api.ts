import type { NodesResponse, RegionsResponse, StatsResponse, TrackerNodeRecord } from './types';

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchNodes(limit = 200, token?: string, region?: string): Promise<NodesResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (region) params.set('region', region);
  const res = await fetch(`/tracker/nodes?${params}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.status}`);
  return res.json() as Promise<NodesResponse>;
}

export async function fetchRegions(): Promise<RegionsResponse> {
  const res = await fetch('/tracker/regions');
  if (!res.ok) throw new Error(`Failed to fetch regions: ${res.status}`);
  return res.json() as Promise<RegionsResponse>;
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
