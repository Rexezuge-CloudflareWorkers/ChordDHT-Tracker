import type { StatsResponse, TrackerNodeRecord } from '../types';

export type NodeTypeFilter = 'all' | 'anchors' | 'vnodes';

// toGuestVisibleNodes mirrors the dashboard's masking rule: anonymous viewers
// never see vnodes.
function toGuestVisibleNodes(nodes: TrackerNodeRecord[]): TrackerNodeRecord[] {
  return nodes.filter((n) => !n.is_vnode);
}

// toAdminVisibleNodes applies the node-type selector (admins see everything
// by default).
function toAdminVisibleNodes(nodes: TrackerNodeRecord[], nodeTypeFilter: NodeTypeFilter): TrackerNodeRecord[] {
  if (nodeTypeFilter === 'anchors') return nodes.filter((n) => !n.is_vnode);
  if (nodeTypeFilter === 'vnodes') return nodes.filter((n) => n.is_vnode);
  return nodes;
}

// computeStaleCutoff derives the "last seen" cutoff below which a node renders
// as stale, from the tracker's own generation timestamp and threshold.
function computeStaleCutoff(stats: StatsResponse | null): Date | null {
  if (!stats?.stats_generated_at || !stats?.stale_threshold_seconds) return null;
  return new Date(new Date(stats.stats_generated_at).getTime() - stats.stale_threshold_seconds * 1000);
}

export { computeStaleCutoff, toAdminVisibleNodes, toGuestVisibleNodes };
