import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { getMaxVNodesPerAnchor, getMinAnchorRatio } from '@/db';

class PolicyGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    if (c.req.method !== 'GET') {
      return c.json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'method not allowed', detail: {} } }, 405);
    }
    return c.json({
      max_vnodes_per_anchor: getMaxVNodesPerAnchor(c.env),
      min_anchor_ratio: getMinAnchorRatio(c.env),
    });
  }
}

export { PolicyGetRoute };
