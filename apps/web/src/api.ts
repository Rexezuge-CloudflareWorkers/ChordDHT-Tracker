import type { NodesResponse, StatsResponse, TrackerNodeRecord } from './types';

export async function fetchNodes(limit = 200): Promise<NodesResponse> {
  const res = await fetch(`/tracker/nodes?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.status}`);
  return res.json() as Promise<NodesResponse>;
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch('/tracker/stats');
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json() as Promise<StatsResponse>;
}

export async function fetchNode(nodeId: string): Promise<TrackerNodeRecord> {
  const res = await fetch(`/tracker/nodes/${nodeId}`);
  if (!res.ok) throw new Error(`Failed to fetch node: ${res.status}`);
  return res.json() as Promise<TrackerNodeRecord>;
}
