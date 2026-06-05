interface EnvVarOverrides {
  MAX_NODES?: string;
  STALE_THRESHOLD_SECONDS?: string;
  MAX_VNODES_PER_ANCHOR?: string;
  MIN_ANCHOR_RATIO?: string;
  SERVE_SPA_FROM_WORKER?: string;
  STABLE_BASE_MEMBERS?: string;
  STABLE_BASE_MIN_SIZE?: string;
}

export function createEnv(db: D1Database, rateLimitSuccess = true, adminSecret: string | null = null, vars: EnvVarOverrides = {}): Env {
  return {
    DB: db,
    MAX_NODES: vars.MAX_NODES ?? '1000',
    STALE_THRESHOLD_SECONDS: vars.STALE_THRESHOLD_SECONDS ?? '180',
    MAX_VNODES_PER_ANCHOR: vars.MAX_VNODES_PER_ANCHOR ?? '8',
    MIN_ANCHOR_RATIO: vars.MIN_ANCHOR_RATIO ?? '0.3',
    SERVE_SPA_FROM_WORKER: vars.SERVE_SPA_FROM_WORKER ?? 'false',
    STABLE_BASE_MEMBERS: vars.STABLE_BASE_MEMBERS ?? '',
    STABLE_BASE_MIN_SIZE: vars.STABLE_BASE_MIN_SIZE ?? '6',
    NODE_RATE_LIMITER: {
      limit: async (_opts: { key: string }) => ({ success: rateLimitSuccess }),
    },
    ADMIN_SECRET: { get: async () => adminSecret },
  } as unknown as Env;
}
