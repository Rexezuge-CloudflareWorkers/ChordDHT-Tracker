import { Hono } from 'hono';
import {
  HealthGetRoute,
  StatsGetRoute,
  NodesGetRoute,
  NodesPostRoute,
  NodesSeedsGetRoute,
  NodeGetRoute,
  NodeDeleteRoute,
  NodeHeartbeatPostRoute,
  CRLGetRoute,
  CRLPostRoute,
  AdminVerifyGetRoute,
  RegionsGetRoute,
  GeoGetRoute,
  PolicyGetRoute,
  StableBaseGetRoute,
} from '@/endpoints';
import { getServeSpaFromWorker } from '@/db';
import { SPA_HTML } from '@/generated/spa-shell';

class ChordDHTTrackerWorker {
  private readonly app: Hono<{ Bindings: Env }>;

  constructor() {
    const app = new Hono<{ Bindings: Env }>();

    app.get('/tracker/health', (c) => new HealthGetRoute().handle(c));
    app.get('/tracker/stats', (c) => new StatsGetRoute().handle(c));
    app.post('/tracker/nodes', (c) => new NodesPostRoute().handle(c));
    app.get('/tracker/nodes/seeds', (c) => new NodesSeedsGetRoute().handle(c));
    app.get('/tracker/nodes', (c) => new NodesGetRoute().handle(c));
    app.get('/tracker/nodes/:node_id', (c) => new NodeGetRoute().handle(c));
    app.delete('/tracker/nodes/:node_id', (c) => new NodeDeleteRoute().handle(c));
    app.post('/tracker/nodes/:node_id/heartbeat', (c) => new NodeHeartbeatPostRoute().handle(c));
    app.get('/tracker/crl', (c) => new CRLGetRoute().handle(c));
    app.post('/tracker/crl', (c) => new CRLPostRoute().handle(c));
    app.get('/tracker/admin/verify', (c) => new AdminVerifyGetRoute().handle(c));
    app.get('/tracker/regions', (c) => new RegionsGetRoute().handle(c));
    app.get('/tracker/geo', (c) => new GeoGetRoute().handle(c));
    app.get('/tracker/policy', (c) => new PolicyGetRoute().handle(c));
    app.get('/tracker/stable_base', (c) => new StableBaseGetRoute().handle(c));

    app.get('*', (c) => {
      if (!getServeSpaFromWorker(c.env)) {
        return c.notFound();
      }
      return c.html(SPA_HTML);
    });

    this.app = app;
  }

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return this.app.fetch(request, env, ctx);
  }

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const stub = env.CRON_TASKS.get(env.CRON_TASKS.idFromName('global'));
    const request = new Request('http://internal/run', {
      method: 'POST',
      body: JSON.stringify({
        cron: controller.cron,
        scheduledTime: controller.scheduledTime,
      }),
    });

    ctx.waitUntil(
      stub
        .fetch(request)
        .then(async (response: Response): Promise<void> => {
          if (!response.ok && response.status !== 202) {
            console.error('StaleCleanupWorker returned an error response:', response.status, await response.text());
          }
        })
        .catch((error: unknown): void => {
          console.error('Failed to invoke StaleCleanupWorker:', error);
        }),
    );
  }
}

export { ChordDHTTrackerWorker };
