import { hashURI } from '@/auth';
import { getStableBaseMemberURIs, getStableBaseMinSize, getStaleThresholdSecs } from '@/db';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { errorResponse } from '@/errors';

interface StableBaseRow {
  node_id: string;
  uri: string;
  status: string;
  last_seen: string;
}

class StableBaseGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    let memberURIs: string[];
    try {
      memberURIs = getStableBaseMemberURIs(c.env);
    } catch (error) {
      return errorResponse('INVALID_STABLE_BASE_CONFIG', error instanceof Error ? error.message : String(error), 500);
    }

    const checkedAt = new Date();
    const checkedAtIso = checkedAt.toISOString();
    const staleThresholdSeconds = getStaleThresholdSecs(c.env);
    const staleCutoff = new Date(checkedAt.getTime() - staleThresholdSeconds * 1000).toISOString();
    const minSize = getStableBaseMinSize(c.env);

    const configured = await Promise.all(memberURIs.map(async (uri) => ({ uri, node_id: await hashURI(uri) })));

    const rowsByID = new Map<string, StableBaseRow>();
    if (configured.length > 0) {
      const placeholders = configured.map(() => '?').join(', ');
      const { results } = await c.env.DB.withSession('first-unconstrained')
        .prepare(`SELECT node_id, uri, status, last_seen FROM nodes WHERE node_id IN (${placeholders})`)
        .bind(...configured.map((member) => member.node_id))
        .all<StableBaseRow>();
      for (const row of results) rowsByID.set(row.node_id, row);
    }

    const members = configured.map((member) => {
      const row = rowsByID.get(member.node_id);
      const live = !!row && row.status === 'ACTIVE' && row.last_seen >= staleCutoff;
      return {
        node_id: member.node_id,
        uri: member.uri,
        registered: !!row,
        status: row?.status ?? null,
        last_seen: row?.last_seen ?? null,
        live,
      };
    });

    const liveCount = members.filter((member) => member.live).length;
    const emergencyThreshold = Math.floor(minSize / 2) + 1;

    return c.json({
      stable_base_min_size: minSize,
      configured_count: members.length,
      live_count: liveCount,
      degraded: liveCount < minSize,
      emergency: liveCount < emergencyThreshold,
      emergency_threshold: emergencyThreshold,
      stale_threshold_seconds: staleThresholdSeconds,
      checked_at: checkedAtIso,
      members,
    });
  }
}

export { StableBaseGetRoute };
