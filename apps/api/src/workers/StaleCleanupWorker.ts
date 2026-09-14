import { CronTasksWorker } from '@chord-dht-tracker/background/CronTasksWorker';

// Binding-compat alias: the `CRON_TASKS` DO binding uses class_name
// "StaleCleanupWorker" (see `apps/api/wrangler.template.jsonc` + migrations).
// The implementation lives in `@chord-dht-tracker/background`; this thin
// subclass preserves the registered class name.
class StaleCleanupWorker extends CronTasksWorker {}

export { StaleCleanupWorker };
