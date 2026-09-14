import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, IResponse, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';
import { MiddlewareHandlers } from '@/middleware';

class AdminVerifyGetRoute extends IBaseRoute<AdminVerifyGetRequest, AdminVerifyGetResponse, AdminVerifyGetEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Verify admin token validity',
    responses: {
      '200': {
        description: 'Admin token is valid',
      },
    },
  };

  protected async handleRequest(
    request: AdminVerifyGetRequest,
    env: AdminVerifyGetEnv,
    _cxt: RouteContext<AdminVerifyGetEnv>,
  ): Promise<AdminVerifyGetResponse> {
    await MiddlewareHandlers.requireAdmin(request.raw, env);
    return { admin: true };
  }
}

type AdminVerifyGetRequest = IRequest;

interface AdminVerifyGetResponse extends IResponse {
  admin: boolean;
}

type AdminVerifyGetEnv = TrackerEnv;

export { AdminVerifyGetRoute };
export type { AdminVerifyGetEnv, AdminVerifyGetRequest, AdminVerifyGetResponse };
