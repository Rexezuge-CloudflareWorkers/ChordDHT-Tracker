import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import type { TrackerNodeRecord } from '@/types';
import { sanitizeNode } from '@/types';
import { isAdmin } from '@/auth';
import { parseNodeJsonColumns } from '@/db';

class NodesGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const statusFilter = c.req.query('status');
    const regionFilter = c.req.query('region');
    const limitParam = parseInt(c.req.query('limit') ?? '50', 10);
    const offsetParam = parseInt(c.req.query('offset') ?? '0', 10);
    const limit = isNaN(limitParam) ? 50 : Math.max(1, Math.min(200, limitParam));
    const offset = isNaN(offsetParam) ? 0 : Math.max(0, offsetParam);

    let nodes: TrackerNodeRecord[];
    let total: number;

    if (statusFilter && regionFilter) {
      const { results } = await c.env.DB.prepare(
        'SELECT * FROM nodes WHERE status = ? AND region = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
      ).bind(statusFilter, regionFilter, limit, offset).all<TrackerNodeRecord>();
      nodes = results;
      const countResult = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM nodes WHERE status = ? AND region = ?',
      ).bind(statusFilter, regionFilter).first<{ count: number }>();
      total = countResult?.count ?? 0;
    } else if (statusFilter) {
      const { results } = await c.env.DB.prepare(
        'SELECT * FROM nodes WHERE status = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
      ).bind(statusFilter, limit, offset).all<TrackerNodeRecord>();
      nodes = results;
      const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes WHERE status = ?')
        .bind(statusFilter).first<{ count: number }>();
      total = countResult?.count ?? 0;
    } else if (regionFilter) {
      const { results } = await c.env.DB.prepare(
        'SELECT * FROM nodes WHERE region = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
      ).bind(regionFilter, limit, offset).all<TrackerNodeRecord>();
      nodes = results;
      const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes WHERE region = ?')
        .bind(regionFilter).first<{ count: number }>();
      total = countResult?.count ?? 0;
    } else {
      const { results } = await c.env.DB.prepare('SELECT * FROM nodes ORDER BY last_seen DESC LIMIT ? OFFSET ?')
        .bind(limit, offset).all<TrackerNodeRecord>();
      nodes = results;
      const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();
      total = countResult?.count ?? 0;
    }

    const admin = await isAdmin(c.req.raw, c.env);
    return c.json({ nodes: nodes.map(n => sanitizeNode(parseNodeJsonColumns(n), admin)), total, limit, offset });
  }
}

export { NodesGetRoute };
