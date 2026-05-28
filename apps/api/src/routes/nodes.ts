import { Hono } from 'hono';
import type { TrackerNodeRecord, NodeInfo } from '../types';
import { errorResponse } from '../errors';
import { getMaxNodes, getStaleThresholdSecs, evictOverLimit } from '../db';

const nodesRoute = new Hono<{ Bindings: Env }>();

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

function isValidNodeId(id: string): boolean {
  return NODE_ID_REGEX.test(id);
}

// POST /tracker/nodes — Register a node
nodesRoute.post('/', async (c) => {
  let body: { node_id?: unknown; uri?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return errorResponse('INVALID_REQUEST', 'Invalid JSON body', 400);
  }

  const { node_id, uri } = body;
  if (typeof node_id !== 'string' || !isValidNodeId(node_id)) {
    return errorResponse('INVALID_REQUEST', 'node_id must be a 40-character lowercase hex string', 400);
  }
  if (typeof uri !== 'string' || !uri.startsWith('https://')) {
    return errorResponse('INVALID_REQUEST', 'uri must start with https://', 400);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO nodes (node_id, uri, joined_at, last_seen)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET uri = excluded.uri, last_seen = excluded.last_seen`,
  )
    .bind(node_id, uri, now, now)
    .run();

  await evictOverLimit(c.env.DB, getMaxNodes(c.env));

  const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();

  return c.json({
    registered: true,
    known_nodes_count: countResult?.count ?? 0,
    message: 'Node registered successfully',
  });
});

// GET /tracker/nodes/seeds — Registered BEFORE /:node_id so the literal path wins
nodesRoute.get('/seeds', async (c) => {
  const countParam = parseInt(c.req.query('count') ?? '5', 10);
  const count = isNaN(countParam) ? 5 : Math.max(1, Math.min(20, countParam));

  const excludeParam = c.req.query('exclude') ?? '';
  const excludeIds = excludeParam
    .split(',')
    .map((id) => id.trim())
    .filter((id) => isValidNodeId(id));

  const staleThresholdSecs = getStaleThresholdSecs(c.env);
  const cutoff = new Date(Date.now() - staleThresholdSecs * 1000).toISOString();

  let seeds: NodeInfo[];
  if (excludeIds.length > 0) {
    const placeholders = excludeIds.map(() => '?').join(', ');
    const { results } = await c.env.DB.prepare(
      `SELECT node_id, uri FROM nodes WHERE last_seen >= ? AND node_id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT ?`,
    )
      .bind(cutoff, ...excludeIds, count)
      .all<NodeInfo>();
    seeds = results;
  } else {
    const { results } = await c.env.DB.prepare(
      `SELECT node_id, uri FROM nodes WHERE last_seen >= ? ORDER BY RANDOM() LIMIT ?`,
    )
      .bind(cutoff, count)
      .all<NodeInfo>();
    seeds = results;
  }

  const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();

  return c.json({
    seeds,
    total_known: countResult?.count ?? 0,
    note: 'Nodes selected randomly from active list',
  });
});

// GET /tracker/nodes — List all nodes (paginated)
nodesRoute.get('/', async (c) => {
  const statusFilter = c.req.query('status');
  const limitParam = parseInt(c.req.query('limit') ?? '50', 10);
  const offsetParam = parseInt(c.req.query('offset') ?? '0', 10);
  const limit = isNaN(limitParam) ? 50 : Math.max(1, Math.min(200, limitParam));
  const offset = isNaN(offsetParam) ? 0 : Math.max(0, offsetParam);

  let nodes: TrackerNodeRecord[];
  let total: number;

  if (statusFilter) {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM nodes WHERE status = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
    )
      .bind(statusFilter, limit, offset)
      .all<TrackerNodeRecord>();
    nodes = results;
    const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes WHERE status = ?')
      .bind(statusFilter)
      .first<{ count: number }>();
    total = countResult?.count ?? 0;
  } else {
    const { results } = await c.env.DB.prepare('SELECT * FROM nodes ORDER BY last_seen DESC LIMIT ? OFFSET ?')
      .bind(limit, offset)
      .all<TrackerNodeRecord>();
    nodes = results;
    const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();
    total = countResult?.count ?? 0;
  }

  return c.json({ nodes, total, limit, offset });
});

// GET /tracker/nodes/:node_id — Get a specific node
nodesRoute.get('/:node_id', async (c) => {
  const node_id = c.req.param('node_id');
  if (!isValidNodeId(node_id)) {
    return errorResponse('INVALID_REQUEST', 'node_id must be a 40-character lowercase hex string', 400);
  }

  const node = await c.env.DB.prepare('SELECT * FROM nodes WHERE node_id = ?')
    .bind(node_id)
    .first<TrackerNodeRecord>();

  if (!node) {
    return errorResponse('NODE_NOT_FOUND', `Node ${node_id} not found`, 404);
  }

  return c.json(node);
});

// DELETE /tracker/nodes/:node_id — Deregister a node
nodesRoute.delete('/:node_id', async (c) => {
  const node_id = c.req.param('node_id');
  if (!isValidNodeId(node_id)) {
    return errorResponse('INVALID_REQUEST', 'node_id must be a 40-character lowercase hex string', 400);
  }

  const result = await c.env.DB.prepare('DELETE FROM nodes WHERE node_id = ?').bind(node_id).run();

  if (result.meta.changes === 0) {
    return errorResponse('NODE_NOT_FOUND', `Node ${node_id} not found`, 404);
  }

  return c.json({ deregistered: true, node_id });
});

export { nodesRoute };
