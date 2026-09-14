import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';

interface TaskRunSummary {
  itemsProcessed: number;
  itemsFailed: number;
  summary?: string;
}

interface IScheduledTask {
  handle(event: ScheduledController, env: ServiceEnv, ctx: ExecutionContext): Promise<TaskRunSummary | void>;
}

// Template Method base: `handle()` captures the cron invocation context, then
// delegates to the subclass `handleScheduledTask()`. Subclasses read
// `this.event` / `this.env` / `this.ctx` — never take constructor dependencies
// on bindings, so `TaskRegistry` factories stay argument-free (`make: () => task`).
abstract class AbstractScheduledTask implements IScheduledTask {
  protected event!: ScheduledController;
  protected env!: ServiceEnv;
  protected ctx!: ExecutionContext;

  public async handle(
    event: ScheduledController,
    env: ServiceEnv,
    ctx: ExecutionContext,
  ): Promise<TaskRunSummary | void> {
    this.event = event;
    this.env = env;
    this.ctx = ctx;
    return this.handleScheduledTask();
  }

  protected abstract handleScheduledTask(): Promise<TaskRunSummary | void>;
}

export { AbstractScheduledTask };
export type { IScheduledTask, TaskRunSummary };
