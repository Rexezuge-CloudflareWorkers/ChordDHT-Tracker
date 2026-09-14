import type { StatsResponse } from '../types';

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch('/tracker/stats');
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json() as Promise<StatsResponse>;
}
