import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, IResponse, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';
import type { NodeInfo } from '@chord-dht-tracker/shared';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodesSeedsGetRoute extends IBaseRoute<NodesSeedsGetRequest, NodesSeedsGetResponse, NodesSeedsGetEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Get random seed nodes for bootstrapping',
    responses: {
      '200': {
        description: 'Random seed nodes',
      },
    },
  };

  protected async handleRequest(
    request: NodesSeedsGetRequest,
    env: NodesSeedsGetEnv,
    _cxt: RouteContext<NodesSeedsGetEnv>,
  ): Promise<NodesSeedsGetResponse> {
    const count = this.getIntQueryParam(request, 'count', 5, 1, 20);

    const excludeParam = this.getQueryParam(request, 'exclude') ?? '';
    const excludeIds = excludeParam
      .split(',')
      .map((id) => id.trim())
      .filter((id) => NODE_ID_REGEX.test(id));

    const includeCert = this.getQueryParam(request, 'include_cert') === 'true';

    const scope = createRequestScope(env);
    const nodeService = scope.get(Tokens.NodeService);
    return nodeService.getSeeds({ count, excludeIds, includeCert });
  }
}

type NodesSeedsGetRequest = IRequest;

interface NodesSeedsGetResponse extends IResponse {
  seeds: NodeInfo[];
  total_known: number;
  note: string;
}

type NodesSeedsGetEnv = TrackerEnv;

export { NodesSeedsGetRoute };
export type { NodesSeedsGetEnv, NodesSeedsGetRequest, NodesSeedsGetResponse };
