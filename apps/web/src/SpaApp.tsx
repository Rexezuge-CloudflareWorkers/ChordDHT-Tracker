import React, { useState, useEffect, useCallback } from 'react';
import { fetchNodes, fetchStats } from './api';
import type { TrackerNodeRecord, StatsResponse } from './types';
import { StatsPanel } from './components/StatsPanel';
import { RingVisualization } from './components/RingVisualization';
import { NodeTable } from './components/NodeTable';
import { REFRESH_INTERVAL_MS } from './constants';

export default function SpaApp() {
  const [nodes, setNodes] = useState<TrackerNodeRecord[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nodesRes, statsRes] = await Promise.all([fetchNodes(), fetchStats()]);
      setNodes(nodesRes.nodes);
      setStats(statsRes);
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
            <RingVisualization nodes={nodes} />
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col">
            <h2 className="text-sm font-medium text-gray-400 mb-2 shrink-0">
              Nodes <span className="text-gray-600">({nodes.length})</span>
            </h2>
            <NodeTable nodes={nodes} />
          </div>
        </div>
      </main>
    </div>
  );
}
