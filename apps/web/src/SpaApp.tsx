import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchNodes, fetchRegions, fetchStats } from './api';
import type { TrackerNodeRecord, StatsResponse } from './types';
import { StatsPanel } from './components/StatsPanel';
import { RingVisualization } from './components/RingVisualization';
import { NodeTable } from './components/NodeTable';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import { LoginModal } from './components/LoginModal';
import { REFRESH_INTERVAL_MS } from './constants';

export default function SpaApp() {
  const [nodes, setNodes] = useState<TrackerNodeRecord[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(
    () => sessionStorage.getItem('adminToken'),
  );
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [availableRegions, setAvailableRegions] = useState<Record<string, number>>({});
  const adminTokenRef = useRef(adminToken);
  const regionFilterRef = useRef(regionFilter);

  useEffect(() => { regionFilterRef.current = regionFilter; }, [regionFilter]);

  const selectedNode = nodes.find(n => n.node_id === selectedNodeId) ?? null;
  const knownNodeIds = useMemo(() => new Set(nodes.map(n => n.node_id)), [nodes]);

  // refresh reads token from ref so the function reference stays stable,
  // avoiding interval teardown/restart on every login/logout.
  const refresh = useCallback(async () => {
    try {
      const token = adminTokenRef.current ?? undefined;
      const region = regionFilterRef.current || undefined;
      const [nodesRes, statsRes, regionsRes] = await Promise.all([
        fetchNodes(200, token, region),
        fetchStats(),
        fetchRegions().catch(() => ({ regions: {} })),
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedNodeId(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleLoginSuccess = (token: string) => {
    adminTokenRef.current = token;
    setAdminToken(token);
    setLoginModalOpen(false);
    void refresh();
  };

  const handleLogout = () => {
    adminTokenRef.current = null;
    sessionStorage.removeItem('adminToken');
    setAdminToken(null);
    void refresh();
  };

  const isAdmin = adminToken !== null;

  return (
    <div className="min-h-screen" style={{ background: '#101319' }}>
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Chord DHT Tracker</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {lastRefresh ? (
              <>
                Last updated {lastRefresh.toLocaleTimeString()} ·{' '}
                {paused ? (
                  <span className="text-amber-400">Paused</span>
                ) : (
                  `auto-refreshes every ${REFRESH_INTERVAL_MS / 1000}s`
                )}
              </>
            ) : (
              'Loading…'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-indigo-400 rounded-md border border-gray-700 transition-colors cursor-pointer"
            >
              Admin · Logout
            </button>
          ) : (
            <button
              onClick={() => setLoginModalOpen(true)}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-md border border-gray-700 transition-colors cursor-pointer"
            >
              Login
            </button>
          )}
          <button
            onClick={() => setPaused(p => !p)}
            className={
              paused
                ? 'px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md border border-indigo-500 transition-colors cursor-pointer'
                : 'px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md border border-gray-700 transition-colors cursor-pointer'
            }
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </header>

      <main className="px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <StatsPanel stats={stats} />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="text-sm font-medium text-gray-400 mb-4">Ring Topology</h2>
            <RingVisualization
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              onNodeSelect={setSelectedNodeId}
              isAdmin={isAdmin}
            />
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2 shrink-0 gap-2">
              <h2 className="text-sm font-medium text-gray-400">
                Nodes <span className="text-gray-600">({nodes.length})</span>
              </h2>
              {Object.keys(availableRegions).length > 0 && (
                <select
                  value={regionFilter}
                  onChange={(e) => { setRegionFilter(e.target.value); void refresh(); }}
                  className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1 cursor-pointer"
                >
                  <option value="">All regions</option>
                  {Object.entries(availableRegions).map(([r, count]) => (
                    <option key={r} value={r}>{r} ({count})</option>
                  ))}
                </select>
              )}
            </div>
            <NodeTable
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              onNodeSelect={setSelectedNodeId}
            />
          </div>
        </div>
      </main>

      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          knownNodeIds={knownNodeIds}
          onClose={() => setSelectedNodeId(null)}
          onNavigate={setSelectedNodeId}
          isAdmin={isAdmin}
        />
      )}

      {loginModalOpen && (
        <LoginModal
          onSuccess={handleLoginSuccess}
          onClose={() => setLoginModalOpen(false)}
        />
      )}
    </div>
  );
}
