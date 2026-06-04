import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import type { TrackerNodeRecord } from '@/types';
import { sanitizeNode } from '@/types';
import { errorResponse } from '@/errors';
import { isAdmin } from '@/auth';
import { parseNodeJsonColumns, getLogicalVNodeByID } from '@/db';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodeGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const node_id = c.req.param('node_id') ?? '';
    if (!NODE_ID_REGEX.test(node_id)) {
      return errorResponse('INVALID_REQUEST', 'node_id must be a 40-character lowercase hex string', 400);
    }

    const db = c.env.DB.withSession('first-unconstrained');
    const node = await db.prepare('SELECT * FROM nodes WHERE node_id = ?')
      .bind(node_id)
      .first<TrackerNodeRecord>();

    const admin = await isAdmin(c.req.raw, c.env);
    if (node) {
      return c.json(sanitizeNode(parseNodeJsonColumns({ ...node, is_vnode: false }), admin));
    }

    if (admin) {
      const vnode = await getLogicalVNodeByID(db, node_id);
      if (vnode) return c.json(vnode);
    }

    return errorResponse('NODE_NOT_FOUND', `Node ${node_id} not found`, 404);
  }
}

export { NodeGetRoute };
