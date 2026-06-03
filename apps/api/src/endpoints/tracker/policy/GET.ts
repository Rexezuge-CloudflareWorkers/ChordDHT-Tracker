import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';

const DEFAULT_MAX_VNODES_PER_ANCHOR = 8;
const DEFAULT_MIN_ANCHOR_RATIO = 0.3;

class PolicyGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    if (c.req.method !== 'GET') {
      return c.json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'method not allowed', detail: {} } }, 405);
    }
    return c.json({
      max_vnodes_per_anchor: DEFAULT_MAX_VNODES_PER_ANCHOR,
      min_anchor_ratio: DEFAULT_MIN_ANCHOR_RATIO,
    });
  }
}

export { PolicyGetRoute };
