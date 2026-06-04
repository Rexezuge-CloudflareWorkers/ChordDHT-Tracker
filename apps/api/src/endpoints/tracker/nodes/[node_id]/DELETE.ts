import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { errorResponse } from '@/errors';
import { updateAnchorVnodeCount } from '@/db';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodeDeleteRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const node_id = c.req.param('node_id') ?? '';
    if (!NODE_ID_REGEX.test(node_id)) {
      return errorResponse('INVALID_REQUEST', 'node_id must be a 40-character lowercase hex string', 400);
    }

    const db = c.env.DB.withSession('first-primary');
    const result = await db.prepare('DELETE FROM nodes WHERE node_id = ?').bind(node_id).run();

    if (result.meta.changes === 0) {
      const vnode = await db.prepare('SELECT anchor_id FROM vnodes WHERE vnode_id = ?')
        .bind(node_id)
        .first<{ anchor_id: string }>();
      if (!vnode) {
        return errorResponse('NODE_NOT_FOUND', `Node ${node_id} not found`, 404);
      }

      const vnodeResult = await db.prepare('DELETE FROM vnodes WHERE vnode_id = ?').bind(node_id).run();
      if (vnodeResult.meta.changes === 0) {
        return errorResponse('NODE_NOT_FOUND', `Node ${node_id} not found`, 404);
      }

      const countResult = await db.prepare('SELECT COUNT(*) as count FROM vnodes WHERE anchor_id = ?')
        .bind(vnode.anchor_id)
        .first<{ count: number }>();
      await updateAnchorVnodeCount(db, vnode.anchor_id, countResult?.count ?? 0);
    }

    return c.json({ deregistered: true, node_id });
  }
}

export { NodeDeleteRoute };
