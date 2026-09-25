import { NodeDAO, TrackerMetaDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import type { StatsSummaryRow } from '@chord-dht-tracker/backend-data/dao';
import type { D1Queryable } from '@chord-dht-tracker/backend-data/utils';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';

interface StatsSummary {
  total_nodes: number;
  active_nodes: number;
  isolated_nodes: number;
  leaving_nodes: number;
  stale_nodes: number;
  avg_finger_table_coverage: number | null;
  avg_uptime_seconds: number | null;
  oldest_node_joined_at: string | null;
  newest_node_joined_at: string | null;
  expiring_cert_nodes: number;
  active_maintenance_nodes: number;
  avg_cache_hit_rate: number | null;
}

interface StatsResult {
  anchor_nodes: StatsSummary;
  vnodes: StatsSummary;
  tracker_uptime_seconds: number;
  stale_threshold_seconds: number;
  stats_generated_at: string;
}

interface StatsServiceDeps {
  nodeDAO?: () => Promise<NodeDAO>;
  vnodeDAO?: () => Promise<VNodeDAO>;
  metaDAO?: () => Promise<TrackerMetaDAO>;
  config?: AppConfiguration;
}

function normalizeTimestamp(value: string | number | null | undefined, unixSeconds: boolean): string | null {
  if (value == null) return null;
  return unixSeconds ? new Date(Number(value) * 1000).toISOString() : String(value);
}

function normalizeSummary(row: StatsSummaryRow | null, unixSeconds = false): StatsSummary {
  return {
    total_nodes: row?.total_nodes ?? 0,
    active_nodes: row?.active_nodes ?? 0,
    isolated_nodes: row?.isolated_nodes ?? 0,
    leaving_nodes: row?.leaving_nodes ?? 0,
    stale_nodes: row?.stale_nodes ?? 0,
    avg_finger_table_coverage: row?.avg_finger_table_coverage ?? null,
    avg_uptime_seconds: row?.avg_uptime_seconds ?? null,
    oldest_node_joined_at: normalizeTimestamp(row?.oldest_node_joined_at, unixSeconds),
    newest_node_joined_at: normalizeTimestamp(row?.newest_node_joined_at, unixSeconds),
    expiring_cert_nodes: row?.expiring_cert_nodes ?? 0,
    active_maintenance_nodes: row?.active_maintenance_nodes ?? 0,
    avg_cache_hit_rate: row?.avg_cache_hit_rate ?? null,
  };
}

// StatsService aggregates ring-level statistics across anchors and vnodes.
// Aggregation SQL stays in the DAOs; normalization moved from stats/GET.ts.
class StatsService {
  private readonly deps: Required<StatsServiceDeps>;

  constructor(
    private readonly env: ServiceEnv,
    deps: StatsServiceDeps = {},
  ) {
    const db = env.DB as D1Queryable;
    this.deps = {
      nodeDAO: () => Promise.resolve(new NodeDAO(db)),
      vnodeDAO: () => Promise.resolve(new VNodeDAO(db)),
      metaDAO: () => Promise.resolve(new TrackerMetaDAO(db)),
      config: AppConfiguration.fromEnv(env),
      ...deps,
    };
  }

  public async getStats(now: Date = new Date()): Promise<StatsResult> {
    const nowIso = now.toISOString();
    const staleThresholdSeconds = this.deps.config.getStaleThresholdSeconds();
    const staleCutoff = new Date(now.getTime() - staleThresholdSeconds * 1000).toISOString();
    const staleCutoffUnix = Math.floor(now.getTime() / 1000) - staleThresholdSeconds;
    const certExpiryCutoff = Math.floor(now.getTime() / 1000) + 30 * 86_400;

    const nodeDAO = await this.deps.nodeDAO();
    const vnodeDAO = await this.deps.vnodeDAO();
    const [anchorRow, vnodeRow] = await Promise.all([
      nodeDAO.statsAnchors(staleCutoff, certExpiryCutoff),
      vnodeDAO.statsVnodes(staleCutoffUnix),
    ]);
    const metaDAO = await this.deps.metaDAO();
    const startedAt = await metaDAO.ensureStartedAt(nowIso);
    return {
      anchor_nodes: normalizeSummary(anchorRow),
      vnodes: normalizeSummary(vnodeRow, true),
      tracker_uptime_seconds: Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000),
      stale_threshold_seconds: staleThresholdSeconds,
      stats_generated_at: nowIso,
    };
  }
}

export { StatsService };
export type { StatsResult, StatsServiceDeps, StatsSummary };
