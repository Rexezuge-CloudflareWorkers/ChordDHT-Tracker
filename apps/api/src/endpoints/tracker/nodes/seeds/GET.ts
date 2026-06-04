import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import type { NodeInfo } from '@/types';
import { getStaleThresholdSecs } from '@/db';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodesSeedsGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const countParam = parseInt(c.req.query('count') ?? '5', 10);
    const count = isNaN(countParam) ? 5 : Math.max(1, Math.min(20, countParam));

    const excludeParam = c.req.query('exclude') ?? '';
    const excludeIds = excludeParam
      .split(',')
      .map((id) => id.trim())
      .filter((id) => NODE_ID_REGEX.test(id));

    const includeCert = c.req.query('include_cert') === 'true';

    const staleThresholdSecs = getStaleThresholdSecs(c.env);
    const cutoff = new Date(Date.now() - staleThresholdSecs * 1000).toISOString();

    const selectCols = includeCert ? 'node_id, uri, cert_json' : 'node_id, uri';

    type SeedRow = { node_id: string; uri: string; cert_json?: string | null };

    const db = c.env.DB.withSession('first-unconstrained');

    let rows: SeedRow[];
    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(', ');
      const { results } = await db.prepare(
        `SELECT ${selectCols} FROM nodes WHERE last_seen >= ? AND node_id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT ?`,
      )
        .bind(cutoff, ...excludeIds, count)
        .all<SeedRow>();
      rows = results;
    } else {
      const { results } = await db.prepare(
        `SELECT ${selectCols} FROM nodes WHERE last_seen >= ? ORDER BY RANDOM() LIMIT ?`,
      )
        .bind(cutoff, count)
        .all<SeedRow>();
      rows = results;
    }

    const seeds: NodeInfo[] = rows.map((row) => {
      const seed: NodeInfo = { node_id: row.node_id, uri: row.uri };
      if (includeCert && row.cert_json) {
        try {
          seed.certificate = JSON.parse(row.cert_json);
        } catch {
          // Skip malformed cert
        }
      }
      return seed;
    });

    const countResult = await db.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();

    return c.json({
      seeds,
      total_known: countResult?.count ?? 0,
      note: 'Nodes selected randomly from active list',
    });
  }
}

export { NodesSeedsGetRoute };
