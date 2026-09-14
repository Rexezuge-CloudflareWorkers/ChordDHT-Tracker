import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import type { StatsResult } from '@chord-dht-tracker/backend-services/stats';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

class StatsGetRoute extends IBaseRoute<StatsGetRequest, StatsGetResponse, StatsGetEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Ring-level aggregate statistics',
    responses: {
      '200': {
        description: 'Aggregate ring statistics',
      },
    },
  };

  protected async handleRequest(
    _request: StatsGetRequest,
    env: StatsGetEnv,
    _cxt: RouteContext<StatsGetEnv>,
  ): Promise<StatsGetResponse> {
    const scope = createRequestScope(env);
    const statsService = scope.get(Tokens.StatsService);
    return statsService.getStats();
  }
}

type StatsGetRequest = IRequest;

type StatsGetResponse = StatsResult;

type StatsGetEnv = TrackerEnv;

export { StatsGetRoute };
export type { StatsGetEnv, StatsGetRequest, StatsGetResponse };
