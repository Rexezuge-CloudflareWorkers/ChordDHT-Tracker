import { AbstractDurableObjectWorker } from '@chord-dht-tracker/backend-runtime/base';
import { tasksForPhase } from './scheduled/TaskRegistry';

const RUN_PATH = '/run';

interface RunRequest {
  cron?: unknown;
  scheduledTime?: unknown;
}

// Durable Object serializing the hourly cron: the tracker's `scheduled()`
// forwards to the `CRON_TASKS` DO stub (`POST /run`), and the single instance
// (`idFromName('global')`) guarantees only one run at a time — a concurrent
// `POST /run` gets `already_running` → 202. Runs `tasksForPhase(1)` in
// parallel, then `tasksForPhase(2)` in parallel.
class CronTasksWorker extends AbstractDurableObjectWorker {
  private currentRun: Promise<void> | undefined;

  protected override async onRequest(request: Request): Promise<Response> {
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
    } catch {
      console.error('CronTasksWorker run failed');
      return Response.json({ status: 'failed' }, { status: 500 });
    } finally {
      if (this.currentRun === run) {
        this.currentRun = undefined;
      }
    }
  }

  private async runScheduledTaskRequest(request: Request): Promise<void> {
    const event = await this.createScheduledController(request);
    const ctx = this.createExecutionContext();
    await Promise.all(tasksForPhase(1).map((task) => task.handle(event, this.env, ctx)));
    await Promise.all(tasksForPhase(2).map((task) => task.handle(event, this.env, ctx)));
  }

  private async createScheduledController(request: Request): Promise<ScheduledController> {
    let payload: RunRequest = {};
    try {
      payload = (await request.json());
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

export { CronTasksWorker };
