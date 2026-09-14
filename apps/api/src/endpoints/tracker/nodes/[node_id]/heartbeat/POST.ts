import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import type { HeartbeatBody, VNodeHeartbeatBody } from '@/types';
import { errorResponse } from '@/errors';
import { getMaxVNodesPerAnchor } from '@/db';

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
      const parsed = await c.req.json<HeartbeatBody>();
      if (parsed !== null && typeof parsed === 'object') {
        body = parsed;
      }
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

      return c.json({ acknowledged: true, tracker_time: now });
    }

    // Anchor heartbeat succeeded. Apply batched per-vnode snapshots when the
    // anchor piggybacks them (Option B: 1 RPC per interval). Same UPDATE
    // semantics as a direct vnode heartbeat; ownership is enforced so an
    // anchor can never touch another anchor's vnodes. Unknown vnode_ids are
    // reported per-item so the anchor can re-register via POST /tracker/nodes.
    const batchRaw = (body as { vnode_heartbeats?: unknown }).vnode_heartbeats;
    if (batchRaw === undefined) {
      return c.json({ acknowledged: true, tracker_time: now });
    }
    if (!Array.isArray(batchRaw)) {
      return errorResponse('INVALID_REQUEST', 'vnode_heartbeats must be an array', 400);
    }
    if (batchRaw.length === 0) {
      return c.json({ acknowledged: true, tracker_time: now });
    }
    const limit = getMaxVNodesPerAnchor(c.env);
    if (batchRaw.length > limit) {
      return errorResponse('INVALID_REQUEST', `vnode_heartbeats exceeds limit of ${limit}`, 400);
    }

    const owned = await db
      .prepare('SELECT vnode_id FROM vnodes WHERE anchor_id = ?')
      .bind(node_id)
      .all<{ vnode_id: string }>();
    const ownedSet = new Set((owned.results ?? []).map((r) => r.vnode_id));

    let updated = 0;
    const errors: Array<{ vnode_id: string; code: string }> = [];
    for (const raw of batchRaw) {
      const item = raw as Partial<VNodeHeartbeatBody> | null | undefined;
      const vnodeId = typeof item?.vnode_id === 'string' ? item.vnode_id : '';
      if (!NODE_ID_REGEX.test(vnodeId)) {
        errors.push({ vnode_id: vnodeId, code: 'INVALID_REQUEST' });
        continue;
      }
      if (!ownedSet.has(vnodeId)) {
        errors.push({ vnode_id: vnodeId, code: 'UNKNOWN_VNODE' });
        continue;
      }
      const hb = item as VNodeHeartbeatBody;
      const vnodeResult = await db
        .prepare(
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
           WHERE vnode_id = ? AND anchor_id = ?`,
        )
        .bind(
          nowUnix,
          hb.status ?? null,
          hb.successor_id ?? null,
          hb.predecessor_id ?? null,
          hb.successor_list_size ?? null,
          hb.successor_list_capacity ?? null,
          hb.finger_table_coverage ?? null,
          hb.uptime_seconds ?? null,
          hb.maintenance_cycles ?? null,
          hb.maintenance_mode ?? null,
          hb.cache_hits ?? null,
          hb.cache_misses ?? null,
          hb.cache_size ?? null,
          hb.predecessor_list_size ?? null,
          hb.successor_list ? JSON.stringify(hb.successor_list) : null,
          hb.predecessor_list ? JSON.stringify(hb.predecessor_list) : null,
          hb.rtt_samples ? JSON.stringify(hb.rtt_samples) : null,
          hb.finger_nodes ? JSON.stringify(hb.finger_nodes) : null,
          vnodeId,
          node_id,
        )
        .run();
      if (vnodeResult.meta.changes === 0) {
        errors.push({ vnode_id: vnodeId, code: 'UNKNOWN_VNODE' });
      } else {
        updated++;
      }
    }

    return c.json({ acknowledged: true, tracker_time: now, vnodes: { updated, errors } });
  }
}

export { NodeHeartbeatPostRoute };
