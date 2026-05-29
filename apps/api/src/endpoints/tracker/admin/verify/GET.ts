import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { errorResponse } from '@/errors';
import { isAdmin } from '@/auth';

class AdminVerifyGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    if (!await isAdmin(c.req.raw, c.env)) {
      return errorResponse('UNAUTHORIZED', 'Invalid or missing admin token', 401);
    }
    return c.json({ admin: true });
  }
}

export { AdminVerifyGetRoute };
