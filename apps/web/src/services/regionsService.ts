import type { RegionsResponse } from '../types';

export async function fetchRegions(): Promise<RegionsResponse> {
  const res = await fetch('/tracker/regions');
  if (!res.ok) throw new Error(`Failed to fetch regions: ${res.status}`);
  return res.json() as Promise<RegionsResponse>;
}
