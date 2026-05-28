import React from 'react';
import type { StatsResponse } from '../types';
import { formatUptime } from '../utils';

interface Props {
  stats: StatsResponse | null;
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: color ?? '#f3f4f6' }}>
        {value}
      </p>
    </div>
  );
}

export function StatsPanel({ stats }: Props) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4 h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  const coverage =
    stats.avg_finger_table_coverage != null
      ? `${(stats.avg_finger_table_coverage * 100).toFixed(1)}%`
      : '—';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
      <StatCard label="Total Nodes" value={stats.total_nodes} />
      <StatCard label="Active" value={stats.active_nodes} color="#22c55e" />
      <StatCard label="Isolated" value={stats.isolated_nodes} color="#eab308" />
      <StatCard label="Leaving" value={stats.leaving_nodes} color="#f97316" />
      <StatCard label="Stale" value={stats.stale_nodes} color="#ef4444" />
      <StatCard label="Avg Finger Coverage" value={coverage} />
      <StatCard label="Tracker Uptime" value={formatUptime(stats.tracker_uptime_seconds)} />
    </div>
  );
}
