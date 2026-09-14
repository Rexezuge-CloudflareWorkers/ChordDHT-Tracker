import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import type { StableBaseResult } from '@chord-dht-tracker/backend-services/stable-base';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

class StableBaseGetRoute extends IBaseRoute<StableBaseGetRequest, StableBaseGetResponse, StableBaseGetEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Return configured stable-base member liveness',
    responses: {
      '200': {
        description: 'Stable-base liveness and degraded status',
      },
    },
  };

  protected async handleRequest(
    _request: StableBaseGetRequest,
    env: StableBaseGetEnv,
    _cxt: RouteContext<StableBaseGetEnv>,
  ): Promise<StableBaseGetResponse> {
    const scope = createRequestScope(env);
    return scope.get(Tokens.StableBaseService).getStableBase();
  }
}

type StableBaseGetRequest = IRequest;

type StableBaseGetResponse = StableBaseResult;

type StableBaseGetEnv = TrackerEnv;

export { StableBaseGetRoute };
export type { StableBaseGetEnv, StableBaseGetRequest, StableBaseGetResponse };
