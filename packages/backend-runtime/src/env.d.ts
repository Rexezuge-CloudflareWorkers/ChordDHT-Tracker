declare global {
  interface Env {
    DB: D1Database;
    CA_PUBLIC_KEY_BASE64: SecretsStoreSecret;
    ADMIN_SECRET: SecretsStoreSecret;
    NODE_RATE_LIMITER: RateLimit;
    CRON_TASKS: DurableObjectNamespace;
    MAX_NODES?: string;
    STALE_THRESHOLD_SECONDS?: string;
    STALE_CLEANUP_AFTER_HOURS?: string;
    MAX_VNODES_PER_ANCHOR?: string;
    MIN_ANCHOR_RATIO?: string;
    SERVE_SPA_FROM_WORKER?: string;
    STABLE_BASE_MEMBERS?: string;
    STABLE_BASE_MIN_SIZE?: string;
  }
}

export {};
