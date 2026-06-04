import React from 'react';
import type { StatsResponse, StatsSummary } from '../types';
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

interface SummaryGroupProps {
  title: string;
  summary: StatsSummary;
  showCerts?: boolean;
}

function SummaryGroup({ title, summary, showCerts = false }: SummaryGroupProps) {
  const coverage =
    summary.avg_finger_table_coverage != null
      ? `${(summary.avg_finger_table_coverage * 100).toFixed(1)}%`
      : '—';

  const cacheHitRate =
    summary.avg_cache_hit_rate != null
      ? `${(summary.avg_cache_hit_rate * 100).toFixed(1)}%`
      : '—';

  const avgUptime = summary.avg_uptime_seconds != null ? formatUptime(summary.avg_uptime_seconds) : '—';

  return (
    <section className="bg-gray-950/40 border border-gray-800 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs text-gray-500 uppercase tracking-wide font-medium">{title}</h2>
        <span className="text-xs text-gray-600 tabular-nums">{summary.total_nodes.toLocaleString()} total</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard label="Total" value={summary.total_nodes} />
        <StatCard label="Active" value={summary.active_nodes} color="#22c55e" />
        <StatCard label="Isolated" value={summary.isolated_nodes} color="#eab308" />
        <StatCard label="Leaving" value={summary.leaving_nodes} color="#f97316" />
        <StatCard label="Stale" value={summary.stale_nodes} color="#ef4444" />
        <StatCard label="Active Maint." value={summary.active_maintenance_nodes} color="#f59e0b" />
        <StatCard label="Avg Cache Hit" value={cacheHitRate} />
        <StatCard label="Avg Finger Coverage" value={coverage} />
        <StatCard label="Avg Uptime" value={avgUptime} />
        {showCerts && (
          <StatCard label="Expiring Certs" value={summary.expiring_cert_nodes} color="#f97316" />
        )}
      </div>
    </section>
  );
}

export function StatsPanel({ stats }: Props) {
  if (!stats) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4 h-60 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const vnodeAnchorRatio = stats.anchor_nodes.total_nodes > 0
    ? `${((stats.vnodes.total_nodes / stats.anchor_nodes.total_nodes) * 100).toFixed(1)}%`
    : '—';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
        <SummaryGroup title="Anchor Nodes" summary={stats.anchor_nodes} showCerts />
        <SummaryGroup title="Virtual Nodes" summary={stats.vnodes} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Tracker Uptime" value={formatUptime(stats.tracker_uptime_seconds)} />
        <StatCard label="Stale Window" value={formatUptime(stats.stale_threshold_seconds)} />
        <StatCard label="Virtual Node Ratio" value={vnodeAnchorRatio} />
        <StatCard label="Stats Generated" value={new Date(stats.stats_generated_at).toLocaleTimeString()} />
      </div>
    </div>
  );
}
