import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { getStaleThresholdSecs, getStartedAt } from '@/db';

interface StatsSummaryRow {
  total_nodes: number;
  active_nodes: number | null;
  isolated_nodes: number | null;
  leaving_nodes: number | null;
  stale_nodes: number | null;
  avg_finger_table_coverage: number | null;
  avg_uptime_seconds: number | null;
  oldest_node_joined_at: string | number | null;
  newest_node_joined_at: string | number | null;
  expiring_cert_nodes: number | null;
  active_maintenance_nodes: number | null;
  avg_cache_hit_rate: number | null;
}

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

function normalizeTimestamp(value: string | number | null | undefined, unixSeconds: boolean): string | null {
  if (value == null) return null;
  if (unixSeconds) return new Date(Number(value) * 1000).toISOString();
  return String(value);
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

class StatsGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const now = new Date();
    const nowIso = now.toISOString();
    const staleThresholdSeconds = getStaleThresholdSecs(c.env);
    const staleCutoff = new Date(now.getTime() - staleThresholdSeconds * 1000).toISOString();
    const staleCutoffUnix = Math.floor(now.getTime() / 1000) - staleThresholdSeconds;

    const certExpiryCutoff = Math.floor(now.getTime() / 1000) + 30 * 86400;

    const db = c.env.DB.withSession('first-unconstrained');

    const anchorRow = await db.prepare(
      `SELECT
          COUNT(*)                                              AS total_nodes,
          SUM(CASE WHEN status = 'ACTIVE'   THEN 1 ELSE 0 END) AS active_nodes,
         SUM(CASE WHEN status = 'ISOLATED' THEN 1 ELSE 0 END) AS isolated_nodes,
         SUM(CASE WHEN status = 'LEAVING'  THEN 1 ELSE 0 END) AS leaving_nodes,
         SUM(CASE WHEN last_seen < ?       THEN 1 ELSE 0 END) AS stale_nodes,
         AVG(finger_table_coverage)                            AS avg_finger_table_coverage,
         AVG(uptime_seconds)                                   AS avg_uptime_seconds,
         MIN(joined_at)                                        AS oldest_node_joined_at,
         MAX(joined_at)                                        AS newest_node_joined_at,
         SUM(CASE WHEN cert_expires_at IS NOT NULL AND cert_expires_at <= ? THEN 1 ELSE 0 END) AS expiring_cert_nodes,
         SUM(CASE WHEN maintenance_mode = 'ACTIVE_MAINTENANCE' THEN 1 ELSE 0 END) AS active_maintenance_nodes,
         AVG(CASE WHEN cache_hits + cache_misses > 0
                  THEN CAST(cache_hits AS REAL) / (cache_hits + cache_misses)
                  ELSE NULL END)                               AS avg_cache_hit_rate
        FROM nodes`,
    )
      .bind(staleCutoff, certExpiryCutoff)
      .first<StatsSummaryRow>();

    const vnodeRow = await db.prepare(
      `SELECT
         COUNT(*)                                              AS total_nodes,
         SUM(CASE WHEN status = 'ACTIVE'   THEN 1 ELSE 0 END) AS active_nodes,
         SUM(CASE WHEN status = 'ISOLATED' THEN 1 ELSE 0 END) AS isolated_nodes,
         SUM(CASE WHEN status = 'LEAVING'  THEN 1 ELSE 0 END) AS leaving_nodes,
         SUM(CASE WHEN last_seen < ?       THEN 1 ELSE 0 END) AS stale_nodes,
         AVG(finger_table_coverage)                            AS avg_finger_table_coverage,
         AVG(uptime_seconds)                                   AS avg_uptime_seconds,
         MIN(joined_at)                                        AS oldest_node_joined_at,
         MAX(joined_at)                                        AS newest_node_joined_at,
         0                                                     AS expiring_cert_nodes,
         SUM(CASE WHEN maintenance_mode = 'ACTIVE_MAINTENANCE' THEN 1 ELSE 0 END) AS active_maintenance_nodes,
         AVG(CASE WHEN cache_hits + cache_misses > 0
                  THEN CAST(cache_hits AS REAL) / (cache_hits + cache_misses)
                  ELSE NULL END)                               AS avg_cache_hit_rate
       FROM vnodes`,
    )
      .bind(staleCutoffUnix)
      .first<StatsSummaryRow>();

    const startedAt = await getStartedAt(db, nowIso);
    const trackerUptimeSeconds = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000);

    return c.json({
      anchor_nodes: normalizeSummary(anchorRow),
      vnodes: normalizeSummary(vnodeRow, true),
      tracker_uptime_seconds: trackerUptimeSeconds,
      stale_threshold_seconds: staleThresholdSeconds,
      stats_generated_at: nowIso,
    });
  }
}

export { StatsGetRoute };
