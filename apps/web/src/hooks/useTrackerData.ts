import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNodes, fetchRegions, fetchStats } from '../services';
import type { StatsResponse, TrackerNodeRecord } from '../types';
import { REFRESH_INTERVAL_MS } from '../constants';

interface TrackerData {
  nodes: TrackerNodeRecord[];
  stats: StatsResponse | null;
  availableRegions: Record<string, number>;
  lastRefresh: Date | null;
  error: string | null;
  paused: boolean;
  adminToken: string | null;
  isAdmin: boolean;
  regionFilter: string;
  setPaused: (paused: boolean) => void;
  setRegionFilter: (region: string) => void;
  refresh: () => void;
  login: (token: string) => void;
  logout: () => void;
}

// useTrackerData owns dashboard data + admin session. refresh reads the token
// and region from refs so the callback reference stays stable, avoiding
// interval teardown/restart on every login/logout or filter change.
function useTrackerData(): TrackerData {
  const [nodes, setNodes] = useState<TrackerNodeRecord[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [regionFilter, setRegionFilterState] = useState<string>('');
  const [availableRegions, setAvailableRegions] = useState<Record<string, number>>({});
  const adminTokenRef = useRef(adminToken);
  const regionFilterRef = useRef(regionFilter);

  const refresh = useCallback(async () => {
    try {
      const token = adminTokenRef.current ?? undefined;
      const region = regionFilterRef.current || undefined;
      const [nodesRes, statsRes, regionsRes] = await Promise.all([
        fetchNodes(200, token, region),
        fetchStats(),
        adminTokenRef.current ? fetchRegions().catch(() => ({ regions: {} })) : Promise.resolve({ regions: {} }),
      ]);
      setNodes(nodesRes.nodes);
      setStats(statsRes);
      setAvailableRegions(regionsRes.regions);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    if (paused) return;
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh, paused]);

  const setRegionFilter = useCallback(
    (region: string) => {
      regionFilterRef.current = region;
      setRegionFilterState(region);
      void refresh();
    },
    [refresh],
  );

  const login = useCallback(
    (token: string) => {
      adminTokenRef.current = token;
      setAdminToken(token);
      void refresh();
    },
    [refresh],
  );

  const logout = useCallback(() => {
    adminTokenRef.current = null;
    setAdminToken(null);
    regionFilterRef.current = '';
    setRegionFilterState('');
    setAvailableRegions({});
    setNodes((prev) => prev.filter((n) => !n.is_vnode));
    void refresh();
  }, [refresh]);

  return {
    nodes,
    stats,
    availableRegions,
    lastRefresh,
    error,
    paused,
    adminToken,
    isAdmin: adminToken !== null,
    regionFilter,
    setPaused,
    setRegionFilter,
    refresh,
    login,
    logout,
  };
}

export { useTrackerData };
export type { TrackerData };
