import type { IScheduledTask } from './IScheduledTask';
import { StaleNodeCleanupTask } from './StaleNodeCleanupTask';

interface CronTaskDefinition {
  phase: 1 | 2;
  make: () => IScheduledTask;
}

// Phase 1 runs fully before phase 2 starts (see `CronTasksWorker`); tasks
// within a phase run in parallel. Add new cron tasks here — never in the worker.
const CRON_TASK_DEFINITIONS: CronTaskDefinition[] = [{ phase: 1, make: () => new StaleNodeCleanupTask() }];

function tasksForPhase(phase: 1 | 2): IScheduledTask[] {
  return CRON_TASK_DEFINITIONS.filter((definition) => definition.phase === phase).map((definition) =>
    definition.make(),
  );
}

export { CRON_TASK_DEFINITIONS, tasksForPhase };
export type { CronTaskDefinition };
