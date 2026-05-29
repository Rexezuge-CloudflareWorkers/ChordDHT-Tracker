import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';

class RegionsGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const { results } = await c.env.DB.prepare(
      `SELECT region, COUNT(*) as count
       FROM nodes
       WHERE region IS NOT NULL
       GROUP BY region
       ORDER BY count DESC`,
    ).all<{ region: string; count: number }>();

    const regions: Record<string, number> = {};
    for (const row of results) {
      regions[row.region] = row.count;
    }

    return c.json({ regions });
  }
}

export { RegionsGetRoute };
