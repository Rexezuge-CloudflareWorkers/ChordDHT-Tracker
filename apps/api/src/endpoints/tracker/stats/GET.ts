import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { getStaleThresholdSecs, getStartedAt } from '@/db';

class StatsGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const now = new Date();
    const nowIso = now.toISOString();
    const staleCutoff = new Date(now.getTime() - getStaleThresholdSecs(c.env) * 1000).toISOString();

    const row = await c.env.DB.prepare(
      `SELECT
         COUNT(*)                                              AS total_nodes,
         SUM(CASE WHEN status = 'ACTIVE'   THEN 1 ELSE 0 END) AS active_nodes,
         SUM(CASE WHEN status = 'ISOLATED' THEN 1 ELSE 0 END) AS isolated_nodes,
         SUM(CASE WHEN status = 'LEAVING'  THEN 1 ELSE 0 END) AS leaving_nodes,
         SUM(CASE WHEN last_seen < ?       THEN 1 ELSE 0 END) AS stale_nodes,
         AVG(finger_table_coverage)                            AS avg_finger_table_coverage,
         AVG(uptime_seconds)                                   AS avg_uptime_seconds,
         MIN(joined_at)                                        AS oldest_node_joined_at,
         MAX(joined_at)                                        AS newest_node_joined_at
       FROM nodes`,
    )
      .bind(staleCutoff)
      .first<{
        total_nodes: number;
        active_nodes: number;
        isolated_nodes: number;
        leaving_nodes: number;
        stale_nodes: number;
        avg_finger_table_coverage: number | null;
        avg_uptime_seconds: number | null;
        oldest_node_joined_at: string | null;
        newest_node_joined_at: string | null;
      }>();

    const startedAt = await getStartedAt(c.env.DB, nowIso);
    const trackerUptimeSeconds = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000);

    return c.json({
      total_nodes: row?.total_nodes ?? 0,
      active_nodes: row?.active_nodes ?? 0,
      isolated_nodes: row?.isolated_nodes ?? 0,
      leaving_nodes: row?.leaving_nodes ?? 0,
      stale_nodes: row?.stale_nodes ?? 0,
      avg_finger_table_coverage: row?.avg_finger_table_coverage ?? null,
      avg_uptime_seconds: row?.avg_uptime_seconds ?? null,
      oldest_node_joined_at: row?.oldest_node_joined_at ?? null,
      newest_node_joined_at: row?.newest_node_joined_at ?? null,
      tracker_uptime_seconds: trackerUptimeSeconds,
      stats_generated_at: nowIso,
    });
  }
}

export { StatsGetRoute };
