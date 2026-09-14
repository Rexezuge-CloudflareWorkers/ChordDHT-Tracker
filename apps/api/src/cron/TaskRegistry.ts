import { StaleNodeCleanupTask } from '@/cron/StaleNodeCleanupTask';

export interface CronTask {
  handle(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<unknown>;
}

const PHASE_1_TASKS: CronTask[] = [new StaleNodeCleanupTask()];
const PHASE_2_TASKS: CronTask[] = [];

export function tasksForPhase(phase: 1 | 2): CronTask[] {
  return phase === 1 ? PHASE_1_TASKS : PHASE_2_TASKS;
}
