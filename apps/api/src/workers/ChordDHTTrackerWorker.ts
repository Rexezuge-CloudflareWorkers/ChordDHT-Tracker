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
}

export { ChordDHTTrackerWorker };
