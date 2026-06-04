import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import type { TrackerNodeRecord } from '@/types';
import { sanitizeNode } from '@/types';
import { isAdmin } from '@/auth';
import { parseNodeJsonColumns, getVNodesByAnchor, getLogicalVNodesByAnchors } from '@/db';

class NodesGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const statusFilter = c.req.query('status');
    const regionFilter = c.req.query('region');
    const includeVnodes = c.req.query('include_vnodes') === 'true';
    const limitParam = parseInt(c.req.query('limit') ?? '50', 10);
    const offsetParam = parseInt(c.req.query('offset') ?? '0', 10);
    const limit = isNaN(limitParam) ? 50 : Math.max(1, Math.min(200, limitParam));
    const offset = isNaN(offsetParam) ? 0 : Math.max(0, offsetParam);

    const db = c.env.DB.withSession('first-unconstrained');
    let nodes: TrackerNodeRecord[];
    let total: number;

    if (statusFilter && regionFilter) {
      const { results } = await db.prepare(
        'SELECT * FROM nodes WHERE status = ? AND region = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
      ).bind(statusFilter, regionFilter, limit, offset).all<TrackerNodeRecord>();
      nodes = results;
      const countResult = await db.prepare(
        'SELECT COUNT(*) as count FROM nodes WHERE status = ? AND region = ?',
      ).bind(statusFilter, regionFilter).first<{ count: number }>();
      total = countResult?.count ?? 0;
    } else if (statusFilter) {
      const { results } = await db.prepare(
        'SELECT * FROM nodes WHERE status = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
      ).bind(statusFilter, limit, offset).all<TrackerNodeRecord>();
      nodes = results;
      const countResult = await db.prepare('SELECT COUNT(*) as count FROM nodes WHERE status = ?')
        .bind(statusFilter).first<{ count: number }>();
      total = countResult?.count ?? 0;
    } else if (regionFilter) {
      const { results } = await db.prepare(
        'SELECT * FROM nodes WHERE region = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
      ).bind(regionFilter, limit, offset).all<TrackerNodeRecord>();
      nodes = results;
      const countResult = await db.prepare('SELECT COUNT(*) as count FROM nodes WHERE region = ?')
        .bind(regionFilter).first<{ count: number }>();
      total = countResult?.count ?? 0;
    } else {
      const { results } = await db.prepare('SELECT * FROM nodes ORDER BY last_seen DESC LIMIT ? OFFSET ?')
        .bind(limit, offset).all<TrackerNodeRecord>();
      nodes = results;
      const countResult = await db.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();
      total = countResult?.count ?? 0;
    }

    const admin = await isAdmin(c.req.raw, c.env);
    const parsedNodes = nodes.map(n => parseNodeJsonColumns({ ...n, is_vnode: false }));
    const sanitized = parsedNodes.map(n => sanitizeNode(n, admin));

    // v4.0: attach vnodes for admin view.
    if (admin && sanitized.length > 0) {
      const anchorIDs = parsedNodes.map(n => n.node_id);
      const withVnodes = await Promise.all(
        sanitized.map(async (n) => {
          const vnodeCount = (n as TrackerNodeRecord).vnode_count ?? 0;
          if (vnodeCount === 0) return n;
          const vnodes = await getVNodesByAnchor(db, n.node_id);
          return { ...n, vnodes };
        }),
      );
      if (includeVnodes) {
        const logicalVnodes = await getLogicalVNodesByAnchors(db, anchorIDs);
        return c.json({ nodes: [...withVnodes, ...logicalVnodes], total, limit, offset });
      }
      return c.json({ nodes: withVnodes, total, limit, offset });
    }
    return c.json({ nodes: sanitized, total, limit, offset });
  }
}

export { NodesGetRoute };
