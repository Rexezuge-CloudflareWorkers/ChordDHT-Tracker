import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import type { TrackerNodeRecord } from '@/types';
import { sanitizeNode } from '@/types';
import { errorResponse } from '@/errors';
import { isAdmin } from '@/auth';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodeGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const node_id = c.req.param('node_id') ?? '';
    if (!NODE_ID_REGEX.test(node_id)) {
      return errorResponse('INVALID_REQUEST', 'node_id must be a 40-character lowercase hex string', 400);
    }

    const node = await c.env.DB.prepare('SELECT * FROM nodes WHERE node_id = ?')
      .bind(node_id)
      .first<TrackerNodeRecord>();

    if (!node) {
      return errorResponse('NODE_NOT_FOUND', `Node ${node_id} not found`, 404);
    }

    const admin = await isAdmin(c.req.raw, c.env);
    return c.json(sanitizeNode(node, admin));
  }
}

export { NodeGetRoute };
