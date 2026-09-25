import { Hono } from 'hono';
import { fromHono, HonoOpenAPIRouterType } from 'chanfana';
import { AbstractEntrypointWorker } from '@chord-dht-tracker/backend-runtime/base/AbstractEntrypointWorker';
import {
  DURABLE_OBJECT_CRON_TASKS_RUN_URL,
  DURABLE_OBJECT_NAMESPACE_GLOBAL,
} from '@chord-dht-tracker/backend-runtime/constants/do/Hostnames';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import { createD1SessionEnv } from '@chord-dht-tracker/backend-data/utils';
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
import { SPA_HTML } from '@/generated/spa-shell';

const D1_BOOKMARK_HEADER: string = 'x-d1-bookmark';

type AppRouter = HonoOpenAPIRouterType<{
  Bindings: Env;
}>;

class ChordDHTTrackerWorker extends AbstractEntrypointWorker {
  protected readonly app: AppRouter;

  constructor() {
    super();
    const app: Hono<{ Bindings: Env }> = new Hono<{ Bindings: Env }>();

    const openapi: AppRouter = fromHono(app, {
      docs_url: '/docs',
      openapi_url: '/openapi.json',
    });

    this.registerTrackerRoutes(openapi);

    app.get('*', (c) => {
      return AppConfiguration.fromEnv(c.env).isServeSpaFromWorker() ? c.html(SPA_HTML) : c.notFound();
    });

    this.app = openapi;
  }

  private registerTrackerRoutes(openapi: AppRouter): void {
    openapi.get('/tracker/health', HealthGetRoute);
    openapi.get('/tracker/stats', StatsGetRoute);
    openapi.post('/tracker/nodes', NodesPostRoute);
    openapi.get('/tracker/nodes/seeds', NodesSeedsGetRoute);
    openapi.get('/tracker/nodes', NodesGetRoute);
    openapi.get('/tracker/nodes/:node_id', NodeGetRoute);
    openapi.delete('/tracker/nodes/:node_id', NodeDeleteRoute);
    openapi.post('/tracker/nodes/:node_id/heartbeat', NodeHeartbeatPostRoute);
    openapi.get('/tracker/crl', CRLGetRoute);
    openapi.post('/tracker/crl', CRLPostRoute);
    openapi.get('/tracker/admin/verify', AdminVerifyGetRoute);
    openapi.get('/tracker/regions', RegionsGetRoute);
    openapi.get('/tracker/geo', GeoGetRoute);
    openapi.get('/tracker/policy', PolicyGetRoute);
    openapi.get('/tracker/stable_base', StableBaseGetRoute);
  }

  protected async onRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path: string = new URL(request.url).pathname;
    if (!ChordDHTTrackerWorker.shouldUseD1Session(path, env)) {
      return this.app.fetch(request, env, ctx);
    }

    const incomingBookmark: string | undefined = request.headers.get(D1_BOOKMARK_HEADER)?.trim() || undefined;
    const sessionEnv = createD1SessionEnv(env, incomingBookmark || 'first-primary');
    const response: Response = await this.app.fetch(request, sessionEnv, ctx);
    const bookmark: D1SessionBookmark | null = sessionEnv.DB.getBookmark();
    if (bookmark) {
      response.headers.set(D1_BOOKMARK_HEADER, bookmark);
    }
    response.headers.set('Access-Control-Expose-Headers', D1_BOOKMARK_HEADER);
    return response;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async onScheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const stub = env.CRON_TASKS.get(env.CRON_TASKS.idFromName(DURABLE_OBJECT_NAMESPACE_GLOBAL));
    const request = new Request(DURABLE_OBJECT_CRON_TASKS_RUN_URL, {
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

  private static shouldUseD1Session(path: string, env: Env): boolean {
    if (!path.startsWith('/tracker/')) {
      return false;
    }
    const database = (env as { DB?: { withSession?: unknown } }).DB;
    return typeof database?.withSession === 'function';
  }
}

export { ChordDHTTrackerWorker };
