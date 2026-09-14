import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, IResponse, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

class PolicyGetRoute extends IBaseRoute<PolicyGetRequest, PolicyGetResponse, PolicyGetEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Return vnode policy',
    responses: {
      '200': {
        description: 'Vnode policy limits',
      },
    },
  };

  protected handleRequest(
    _request: PolicyGetRequest,
    env: PolicyGetEnv,
    _cxt: RouteContext<PolicyGetEnv>,
  ): Promise<PolicyGetResponse> {
    const scope = createRequestScope(env);
    const config = scope.get(Tokens.AppConfig);
    return Promise.resolve({
      max_vnodes_per_anchor: config.getMaxVNodesPerAnchor(),
      min_anchor_ratio: config.getMinAnchorRatio(),
    });
  }
}

type PolicyGetRequest = IRequest;

interface PolicyGetResponse extends IResponse {
  max_vnodes_per_anchor: number;
  min_anchor_ratio: number;
}

type PolicyGetEnv = TrackerEnv;

export { PolicyGetRoute };
export type { PolicyGetEnv, PolicyGetRequest, PolicyGetResponse };
