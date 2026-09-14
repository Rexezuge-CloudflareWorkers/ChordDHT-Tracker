import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import type { ListNodesResult } from '@chord-dht-tracker/backend-services/node';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

class NodesGetRoute extends IBaseRoute<NodesGetRequest, NodesGetResponse, NodesGetEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'List all nodes (paginated, optional status/region filter)',
    responses: {
      '200': {
        description: 'Paginated node list',
      },
    },
  };

  protected async handleRequest(
    request: NodesGetRequest,
    env: NodesGetEnv,
    _cxt: RouteContext<NodesGetEnv>,
  ): Promise<NodesGetResponse> {
    const statusFilter = this.getQueryParam(request, 'status');
    const regionFilter = this.getQueryParam(request, 'region');
    const includeVnodes = this.getQueryParam(request, 'include_vnodes') === 'true';
    const limit = this.getIntQueryParam(request, 'limit', 50, 1, 200);
    const offset = this.getIntQueryParam(request, 'offset', 0, 0, Number.MAX_SAFE_INTEGER);

    const scope = createRequestScope(env);
    const admin = await scope.get(Tokens.AuthService).isAdmin(request.raw);
    const nodeService = scope.get(Tokens.NodeService);
    return nodeService.listNodes({
      status: statusFilter || undefined,
      region: regionFilter || undefined,
      includeVnodes,
      limit,
      offset,
      admin,
    });
  }
}

type NodesGetRequest = IRequest;

type NodesGetResponse = ListNodesResult;

type NodesGetEnv = TrackerEnv;

export { NodesGetRoute };
export type { NodesGetEnv, NodesGetRequest, NodesGetResponse };
