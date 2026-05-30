import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';

type CfGeo = { region?: string | null; country?: string | null };

class GeoGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const cf = (c.req.raw as unknown as { cf?: CfGeo }).cf ?? {};
    // cf.region / cf.country are null for Orange-to-Orange (O2O) requests where the
    // node's domain is also Cloudflare-proxied. cf-ipcountry header is always set by
    // Cloudflare based on the connecting IP and survives the O2O proxy chain.
    const region = cf.region ?? null;
    const country = cf.country ?? c.req.header('cf-ipcountry') ?? null;
    return c.json({ region, country });
  }
}

export { GeoGetRoute };
