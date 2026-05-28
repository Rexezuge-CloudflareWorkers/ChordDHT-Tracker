import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { getStartedAt } from '@/db';

class HealthGetRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const now = new Date();
    const nowIso = now.toISOString();
    const startedAt = await getStartedAt(c.env.DB, nowIso);
    const uptimeSeconds = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000);
    return c.json({ status: 'ok', uptime_seconds: uptimeSeconds, timestamp: nowIso });
  }
}

export { HealthGetRoute };
