export {};

declare global {
  interface StableBaseEnv {
    STABLE_BASE_MEMBERS: string;
    STABLE_BASE_MIN_SIZE: string;
  }

  interface StaleCleanupEnv {
    STALE_CLEANUP_AFTER_HOURS: string;
    CRON_TASKS: DurableObjectNamespace;
  }

  type Env = CloudflareEnv & StableBaseEnv & StaleCleanupEnv;
}
