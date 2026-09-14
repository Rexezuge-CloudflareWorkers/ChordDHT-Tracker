import { DurableObject } from 'cloudflare:workers';
import { tasksForPhase } from '@/cron/TaskRegistry';

const RUN_PATH = '/run';

interface RunRequest {
  cron?: unknown;
  scheduledTime?: unknown;
}

class StaleCleanupWorker extends DurableObject<Env> {
  private currentRun: Promise<void> | undefined;

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== RUN_PATH) {
      return Response.json({ error: 'Not Found' }, { status: 404 });
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: { Allow: 'POST' } });
    }
    if (this.currentRun) {
      return Response.json({ status: 'already_running' }, { status: 202 });
    }

    const run = this.runScheduledTaskRequest(request);
    this.currentRun = run;
    try {
      await run;
      return Response.json({ status: 'completed' });
    } catch (error: unknown) {
      console.error('StaleCleanupWorker run failed:', error);
      return Response.json({ status: 'failed' }, { status: 500 });
    } finally {
      if (this.currentRun === run) {
        this.currentRun = undefined;
      }
    }
  }

  private async runScheduledTaskRequest(request: Request): Promise<void> {
    const event = await this.createScheduledController(request);
    const ctx = {
      waitUntil: (promise: Promise<unknown>): void => this.ctx.waitUntil(promise),
      passThroughOnException: (): void => undefined,
    } as unknown as ExecutionContext;
    await Promise.all(tasksForPhase(1).map((task) => task.handle(event, this.env, ctx)));
    await Promise.all(tasksForPhase(2).map((task) => task.handle(event, this.env, ctx)));
  }

  private async createScheduledController(request: Request): Promise<ScheduledController> {
    let payload: RunRequest = {};
    try {
      payload = (await request.json()) as RunRequest;
    } catch {
      payload = {};
    }
    return {
      cron: typeof payload.cron === 'string' ? payload.cron : '',
      scheduledTime: typeof payload.scheduledTime === 'number' ? payload.scheduledTime : Date.now(),
      noRetry: (): void => undefined,
    };
  }
}

export { StaleCleanupWorker };
