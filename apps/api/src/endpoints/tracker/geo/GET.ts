import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';

type CfGeo = { region?: string | null; country?: string | null };

class GeoGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const cf = (c.req.raw as unknown as { cf?: CfGeo }).cf ?? {};
    return c.json({
      region: cf.region ?? null,
      country: cf.country ?? null,
    });
  }
}

export { GeoGetRoute };
