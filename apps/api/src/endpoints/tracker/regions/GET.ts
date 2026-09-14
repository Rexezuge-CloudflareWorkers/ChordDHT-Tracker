import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, IResponse, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

class RegionsGetRoute extends IBaseRoute<RegionsGetRequest, RegionsGetResponse, RegionsGetEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'List known regions and node counts',
    responses: {
      '200': {
        description: 'Region counts',
      },
    },
  };

  protected async handleRequest(
    _request: RegionsGetRequest,
    env: RegionsGetEnv,
    _cxt: RouteContext<RegionsGetEnv>,
  ): Promise<RegionsGetResponse> {
    const scope = createRequestScope(env);
    return scope.get(Tokens.NodeService).regionCounts();
  }
}

type RegionsGetRequest = IRequest;

interface RegionsGetResponse extends IResponse {
  regions: Record<string, number>;
}

type RegionsGetEnv = TrackerEnv;

export { RegionsGetRoute };
export type { RegionsGetEnv, RegionsGetRequest, RegionsGetResponse };
