import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { ExtendedResponse, IRequest, IResponse, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

class CRLGetRoute extends IBaseRoute<CRLGetRequest, CRLGetResponse, CRLGetEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Fetch the current Certificate Revocation List',
    responses: {
      '200': {
        description: 'Current CRL JSON',
      },
    },
  };

  protected async handleRequest(
    _request: CRLGetRequest,
    env: CRLGetEnv,
    _cxt: RouteContext<CRLGetEnv>,
  ): Promise<CRLGetResponse> {
    const scope = createRequestScope(env);
    const crlJson = await scope.get(Tokens.CrlService).getLatest();
    return { rawBody: crlJson, headers: { 'Content-Type': 'application/json' } };
  }
}

type CRLGetRequest = IRequest;

type CRLGetResponse = ExtendedResponse<IResponse>;

type CRLGetEnv = TrackerEnv;

export { CRLGetRoute };
export type { CRLGetEnv, CRLGetRequest, CRLGetResponse };
