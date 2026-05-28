import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import type { NodeInfo } from '@/types';
import { getStaleThresholdSecs } from '@/db';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodesSeedsGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const countParam = parseInt(c.req.query('count') ?? '5', 10);
    const count = isNaN(countParam) ? 5 : Math.max(1, Math.min(20, countParam));

    const excludeParam = c.req.query('exclude') ?? '';
    const excludeIds = excludeParam
      .split(',')
      .map((id) => id.trim())
      .filter((id) => NODE_ID_REGEX.test(id));

    const staleThresholdSecs = getStaleThresholdSecs(c.env);
    const cutoff = new Date(Date.now() - staleThresholdSecs * 1000).toISOString();

    let seeds: NodeInfo[];
    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(', ');
      const { results } = await c.env.DB.prepare(
        `SELECT node_id, uri FROM nodes WHERE last_seen >= ? AND node_id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT ?`,
      )
        .bind(cutoff, ...excludeIds, count)
        .all<NodeInfo>();
      seeds = results;
    } else {
      const { results } = await c.env.DB.prepare(
        `SELECT node_id, uri FROM nodes WHERE last_seen >= ? ORDER BY RANDOM() LIMIT ?`,
      )
        .bind(cutoff, count)
        .all<NodeInfo>();
      seeds = results;
    }

    const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();

    return c.json({
      seeds,
      total_known: countResult?.count ?? 0,
      note: 'Nodes selected randomly from active list',
    });
  }
}

export { NodesSeedsGetRoute };
