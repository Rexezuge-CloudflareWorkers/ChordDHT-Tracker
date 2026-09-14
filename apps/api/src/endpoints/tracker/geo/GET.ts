import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, IResponse, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

class GeoGetRoute extends IBaseRoute<GeoGetRequest, GeoGetResponse, GeoGetEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Return request geolocation',
    responses: {
      '200': {
        description: 'Region/country from Cloudflare metadata',
      },
    },
  };

  protected handleRequest(
    request: GeoGetRequest,
    _env: GeoGetEnv,
    _cxt: RouteContext<GeoGetEnv>,
  ): Promise<GeoGetResponse> {
    const cf = (request.raw as unknown as { cf?: GeoCf }).cf ?? {};
    // cf.region / cf.country are null for Orange-to-Orange (O2O) requests where the
    // node's domain is also Cloudflare-proxied. cf-ipcountry header is always set by
    // Cloudflare based on the connecting IP and survives the O2O proxy chain.
    const region = cf.region ?? null;
    const country = cf.country ?? request.raw.headers.get('cf-ipcountry') ?? null;
    return Promise.resolve({ region, country });
  }
}

type GeoGetRequest = IRequest;

interface GeoCf {
  region?: string | null;
  country?: string | null;
}

interface GeoGetResponse extends IResponse {
  region: string | null;
  country: string | null;
}

type GeoGetEnv = TrackerEnv;

export { GeoGetRoute };
export type { GeoGetEnv, GeoGetRequest, GeoGetResponse };
