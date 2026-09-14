// Shared service env (Value Object) for the Chord DHT tracker worker.
// Extend per-domain rather than redeclaring.
// NOTE: DB is intentionally `unknown` here — backend-runtime (Layer 1)
// must not import backend-data (Layer 2). Narrow to D1Queryable at use sites.
interface ServiceEnv {
  DB: unknown;
  CA_PUBLIC_KEY_BASE64: SecretsStoreSecret | { get(): Promise<string> };
  ADMIN_SECRET: SecretsStoreSecret | { get(): Promise<string> };
  NODE_RATE_LIMITER: unknown;
  CRON_TASKS?: DurableObjectNamespace;
  MAX_NODES?: string;
  STALE_THRESHOLD_SECONDS?: string;
  STALE_CLEANUP_AFTER_HOURS?: string;
  MAX_VNODES_PER_ANCHOR?: string;
  MIN_ANCHOR_RATIO?: string;
  SERVE_SPA_FROM_WORKER?: string;
  STABLE_BASE_MEMBERS?: string;
  STABLE_BASE_MIN_SIZE?: string;
}

export type { ServiceEnv };
