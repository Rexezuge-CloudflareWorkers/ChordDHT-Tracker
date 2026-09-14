export {};

// The background worker shares the tracker's Cloudflare bindings (D1 `DB`,
// `CRON_TASKS` DO namespace, Secrets Store secrets, tracker vars). Declared
// here so `CronTasksWorker` (a `DurableObject<Env>`) typechecks as its own
// package entry point, mirroring `apps/api/src/env.d.ts`.
declare global {
  type Env = CloudflareEnv;
}
