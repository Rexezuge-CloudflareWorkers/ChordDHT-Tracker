# ChordDHT-Tracker — Background Worker

Scope: `apps/background/**`. Parent index: `../../AGENTS.md`.

`@chord-dht-tracker/background` owns the hourly cron pipeline: `CronTasksWorker`
(a `DurableObject` behind the `CRON_TASKS` binding, cron `0 * * * *`) runs the
phased `TaskRegistry`; the tracker's `scheduled()` forwards to the DO stub
(`POST /run`, single `DURABLE_OBJECT_NAMESPACE_GLOBAL` instance serializes runs).

## Package Layout

- `src/CronTasksWorker.ts` — extends `AbstractDurableObjectWorker` (from
  `@chord-dht-tracker/backend-runtime/base`); implements `onRequest()`:
  `POST /run` only (404 otherwise, 405 for non-POST), `currentRun` guard →
  `already_running` / 202, then `tasksForPhase(1)` in parallel followed by
  `tasksForPhase(2)` in parallel.
- `src/scheduled/IScheduledTask.ts` — `IScheduledTask` interface
  (`handle(event, env, ctx)` with `ServiceEnv` from
  `@chord-dht-tracker/backend-runtime/config`) + `AbstractScheduledTask`
  Template Method base (captures invocation context, delegates to abstract
  `handleScheduledTask(): Promise<TaskRunSummary | void>`, where
  `TaskRunSummary = { itemsProcessed, itemsFailed, summary? }`).
- `src/scheduled/TaskRegistry.ts` — `CRON_TASK_DEFINITIONS`
  (`{ phase: 1 | 2, make: () => IScheduledTask }[]`) + `tasksForPhase(phase)`.
  Phase 1 registered: `StaleNodeCleanupTask`. Phase 2: empty.
- `src/scheduled/StaleNodeCleanupTask.ts` — resolves `MaintenanceService` via
  `createRequestScope(env)` (`@chord-dht-tracker/backend-services/composition`,
  `scope.get(Tokens.MaintenanceService)`) and calls `runCleanup(scheduledTime)`.
- `src/index.ts` / `src/scheduled/index.ts` — barrels backing the `.`,
  `./CronTasksWorker`, `./scheduled`, `./scheduled/*` exports.
- `src/env.d.ts` — `type Env = CloudflareEnv` so the DO typechecks standalone.

## How To Add A Task

1. Create `src/scheduled/<Name>Task.ts` extending `AbstractScheduledTask`;
   implement `handleScheduledTask()` using `this.event` / `this.env` / `this.ctx`.
2. Resolve services via `createRequestScope(this.env)` + `Tokens.*` — never
   `new XService(env)` and never `@/db` helpers.
3. Register `{ phase: 1 | 2, make: () => new <Name>Task() }` in
   `CRON_TASK_DEFINITIONS`. Add tasks here, not in the worker.
4. Keep tasks idempotent and phase-appropriate (phase 1 completes fully before
   phase 2 starts; tasks within a phase run in parallel).

## Binding Compat

Wrangler still registers class_name `StaleCleanupWorker`
(`apps/api/wrangler.template.jsonc` DO section + migrations unchanged):
`apps/api/src/workers/StaleCleanupWorker.ts` is a thin
`extends CronTasksWorker` subclass preserving the name, and
`apps/api/src/index.ts` (the worker `main` entry) re-exports both
`StaleCleanupWorker` and `CronTasksWorker`.

Token-adjacent logging must use static messages only (never interpolate caught
errors or secrets).
