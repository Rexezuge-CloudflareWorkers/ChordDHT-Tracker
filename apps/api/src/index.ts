import { ChordDHTTrackerWorker } from '@/workers';

export { StaleCleanupWorker } from '@/workers/StaleCleanupWorker';
export { CronTasksWorker } from '@chord-dht-tracker/background/CronTasksWorker';

const worker = new ChordDHTTrackerWorker();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return worker.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    return worker.scheduled(controller, env, ctx);
  },
};
