import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { errorResponse } from '@/errors';
import { getMaxNodes, evictOverLimit } from '@/db';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodesPostRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    let body: { node_id?: unknown; uri?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid JSON body', 400);
    }

    const { node_id, uri } = body;
    if (typeof node_id !== 'string' || !NODE_ID_REGEX.test(node_id)) {
      return errorResponse('INVALID_REQUEST', 'node_id must be a 40-character lowercase hex string', 400);
    }
    if (typeof uri !== 'string' || !uri.startsWith('https://')) {
      return errorResponse('INVALID_REQUEST', 'uri must start with https://', 400);
    }

    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO nodes (node_id, uri, joined_at, last_seen)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(node_id) DO UPDATE SET uri = excluded.uri, last_seen = excluded.last_seen`,
    )
      .bind(node_id, uri, now, now)
      .run();

    await evictOverLimit(c.env.DB, getMaxNodes(c.env));

    const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();

    return c.json({
      registered: true,
      known_nodes_count: countResult?.count ?? 0,
      message: 'Node registered successfully',
    });
  }
}

export { NodesPostRoute };
