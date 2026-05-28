import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { errorResponse } from '@/errors';

class CRLGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const row = await c.env.DB.prepare('SELECT crl_json FROM crl ORDER BY id DESC LIMIT 1').first<{
      crl_json: string;
    }>();

    if (!row) {
      return errorResponse('NOT_FOUND', 'No CRL available', 404);
    }

    return new Response(row.crl_json, {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export { CRLGetRoute };
