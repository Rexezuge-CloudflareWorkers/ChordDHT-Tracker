import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import type { HeartbeatBody } from '@/types';
import { errorResponse } from '@/errors';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodeHeartbeatPostRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const node_id = c.req.param('node_id') ?? '';
    if (!NODE_ID_REGEX.test(node_id)) {
      return errorResponse('INVALID_REQUEST', 'node_id must be a 40-character lowercase hex string', 400);
    }

    const { success } = await c.env.NODE_RATE_LIMITER.limit({ key: node_id });
    if (!success) {
      return errorResponse('RATE_LIMITED', 'Rate limit exceeded for this node', 429);
    }

    let body: HeartbeatBody = {};
    try {
      body = await c.req.json<HeartbeatBody>();
    } catch {
      // Body is entirely optional; default to empty
    }

    const now = new Date().toISOString();
    const nowUnix = Math.floor(Date.now() / 1000);
    const db = c.env.DB.withSession('first-primary');

    const result = await db.prepare(
      `UPDATE nodes SET
         last_seen             = ?,
         status                = COALESCE(?, status),
         successor_id          = ?,
         predecessor_id        = ?,
         successor_list_size   = ?,
         successor_list_capacity = ?,
         finger_table_coverage = ?,
         uptime_seconds        = ?,
         maintenance_cycles    = ?,
         cert_expires_at       = COALESCE(?, cert_expires_at),
         region                = COALESCE(?, region),
         maintenance_mode      = COALESCE(?, maintenance_mode),
         cache_hits            = ?,
         cache_misses          = ?,
         cache_size            = ?,
         predecessor_list_size = ?,
         successor_list        = ?,
         predecessor_list      = ?,
         rtt_samples           = ?,
         finger_nodes          = ?,
         report_count          = report_count + 1
       WHERE node_id = ?`,
    )
      .bind(
        now,
        body.status ?? null,
        body.successor_id ?? null,
        body.predecessor_id ?? null,
        body.successor_list_size ?? null,
        body.successor_list_capacity ?? null,
        body.finger_table_coverage ?? null,
        body.uptime_seconds ?? null,
        body.maintenance_cycles ?? null,
        body.cert_expires_at ?? null,
        body.region ?? null,
        body.maintenance_mode ?? null,
        body.cache_hits ?? null,
        body.cache_misses ?? null,
        body.cache_size ?? null,
        body.predecessor_list_size ?? null,
        body.successor_list ? JSON.stringify(body.successor_list) : null,
        body.predecessor_list ? JSON.stringify(body.predecessor_list) : null,
        body.rtt_samples ? JSON.stringify(body.rtt_samples) : null,
        body.finger_nodes ? JSON.stringify(body.finger_nodes) : null,
        node_id,
      )
      .run();

    if (result.meta.changes === 0) {
      const vnodeResult = await db.prepare(
        `UPDATE vnodes SET
           last_seen               = ?,
           status                  = COALESCE(?, status),
           successor_id            = ?,
           predecessor_id          = ?,
           successor_list_size     = ?,
           successor_list_capacity = ?,
           finger_table_coverage   = ?,
           uptime_seconds          = ?,
           maintenance_cycles      = ?,
           maintenance_mode        = COALESCE(?, maintenance_mode),
           cache_hits              = ?,
           cache_misses            = ?,
           cache_size              = ?,
           predecessor_list_size   = ?,
           successor_list          = ?,
           predecessor_list        = ?,
           rtt_samples             = ?,
           finger_nodes            = ?,
           report_count            = report_count + 1
         WHERE vnode_id = ?`,
      )
        .bind(
          nowUnix,
          body.status ?? null,
          body.successor_id ?? null,
          body.predecessor_id ?? null,
          body.successor_list_size ?? null,
          body.successor_list_capacity ?? null,
          body.finger_table_coverage ?? null,
          body.uptime_seconds ?? null,
          body.maintenance_cycles ?? null,
          body.maintenance_mode ?? null,
          body.cache_hits ?? null,
          body.cache_misses ?? null,
          body.cache_size ?? null,
          body.predecessor_list_size ?? null,
          body.successor_list ? JSON.stringify(body.successor_list) : null,
          body.predecessor_list ? JSON.stringify(body.predecessor_list) : null,
          body.rtt_samples ? JSON.stringify(body.rtt_samples) : null,
          body.finger_nodes ? JSON.stringify(body.finger_nodes) : null,
          node_id,
        )
        .run();

      if (vnodeResult.meta.changes === 0) {
        return errorResponse('NODE_NOT_FOUND', `Node ${node_id} not found`, 404);
      }
    }

    return c.json({ acknowledged: true, tracker_time: now });
  }
}

export { NodeHeartbeatPostRoute };
