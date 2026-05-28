import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import type { TrackerNodeRecord } from '@/types';

class NodesGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const statusFilter = c.req.query('status');
    const limitParam = parseInt(c.req.query('limit') ?? '50', 10);
    const offsetParam = parseInt(c.req.query('offset') ?? '0', 10);
    const limit = isNaN(limitParam) ? 50 : Math.max(1, Math.min(200, limitParam));
    const offset = isNaN(offsetParam) ? 0 : Math.max(0, offsetParam);

    let nodes: TrackerNodeRecord[];
    let total: number;

    if (statusFilter) {
      const { results } = await c.env.DB.prepare(
        'SELECT * FROM nodes WHERE status = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
      )
        .bind(statusFilter, limit, offset)
        .all<TrackerNodeRecord>();
      nodes = results;
      const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes WHERE status = ?')
        .bind(statusFilter)
        .first<{ count: number }>();
      total = countResult?.count ?? 0;
    } else {
      const { results } = await c.env.DB.prepare('SELECT * FROM nodes ORDER BY last_seen DESC LIMIT ? OFFSET ?')
        .bind(limit, offset)
        .all<TrackerNodeRecord>();
      nodes = results;
      const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();
      total = countResult?.count ?? 0;
    }

    return c.json({ nodes, total, limit, offset });
  }
}

export { NodesGetRoute };
