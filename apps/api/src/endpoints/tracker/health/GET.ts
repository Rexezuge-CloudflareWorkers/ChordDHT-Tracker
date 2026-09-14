import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, IResponse, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

class HealthGetRoute extends IBaseRoute<HealthGetRequest, HealthGetResponse, HealthGetEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Worker uptime and status',
    responses: {
      '200': {
        description: 'Worker status with uptime',
      },
    },
  };

  protected async handleRequest(
    _request: HealthGetRequest,
    env: HealthGetEnv,
    _cxt: RouteContext<HealthGetEnv>,
  ): Promise<HealthGetResponse> {
    const now = new Date();
    const nowIso = now.toISOString();
    const scope = createRequestScope(env);
    const metaDAO = await scope.get(Tokens.MetaDAO)();
    const startedAt = await metaDAO.ensureStartedAt(nowIso);
    const uptimeSeconds = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000);
    return { status: 'ok', uptime_seconds: uptimeSeconds, timestamp: nowIso };
  }
}

type HealthGetRequest = IRequest;

interface HealthGetResponse extends IResponse {
  status: string;
  uptime_seconds: number;
  timestamp: string;
}

type HealthGetEnv = TrackerEnv;

export { HealthGetRoute };
export type { HealthGetEnv, HealthGetRequest, HealthGetResponse };
