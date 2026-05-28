import { Hono } from 'hono';
import type { HeartbeatBody } from '../types';
import { errorResponse } from '../errors';

const heartbeatRoute = new Hono<{ Bindings: Env }>();

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

// POST /tracker/nodes/:node_id/heartbeat
heartbeatRoute.post('/:node_id/heartbeat', async (c) => {
  const node_id = c.req.param('node_id');
  if (!NODE_ID_REGEX.test(node_id)) {
    return errorResponse('INVALID_REQUEST', 'node_id must be a 40-character lowercase hex string', 400);
  }

  let body: HeartbeatBody = {};
  try {
    body = await c.req.json<HeartbeatBody>();
  } catch {
    // Body is entirely optional; default to empty
  }

  const now = new Date().toISOString();

  const result = await c.env.DB.prepare(
    `UPDATE nodes SET
       last_seen             = ?,
       status                = COALESCE(?, status),
       successor_id          = ?,
       predecessor_id        = ?,
       successor_list_size   = ?,
       finger_table_coverage = ?,
       uptime_seconds        = ?,
       maintenance_cycles    = ?,
       report_count          = report_count + 1
     WHERE node_id = ?`,
  )
    .bind(
      now,
      body.status ?? null,
      body.successor_id ?? null,
      body.predecessor_id ?? null,
      body.successor_list_size ?? null,
      body.finger_table_coverage ?? null,
      body.uptime_seconds ?? null,
      body.maintenance_cycles ?? null,
      node_id,
    )
    .run();

  if (result.meta.changes === 0) {
    return errorResponse('NODE_NOT_FOUND', `Node ${node_id} not found`, 404);
  }

  return c.json({ acknowledged: true, tracker_time: now });
});

export { heartbeatRoute };
