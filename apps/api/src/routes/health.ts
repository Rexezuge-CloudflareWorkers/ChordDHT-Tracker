import { Hono } from 'hono';
import { getStartedAt } from '../db';

const healthRoute = new Hono<{ Bindings: Env }>();

// GET /tracker/health
healthRoute.get('/health', async (c) => {
  const now = new Date();
  const nowIso = now.toISOString();
  const startedAt = await getStartedAt(c.env.DB, nowIso);
  const uptimeSeconds = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000);

  return c.json({ status: 'ok', uptime_seconds: uptimeSeconds, timestamp: nowIso });
});

export { healthRoute };
