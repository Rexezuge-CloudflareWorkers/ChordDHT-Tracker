export function createEnv(db: D1Database, rateLimitSuccess = true, adminSecret: string | null = null): Env {
  return {
    DB: db,
    MAX_NODES: '1000',
    STALE_THRESHOLD_SECONDS: '180',
    NODE_RATE_LIMITER: {
      limit: async (_opts: { key: string }) => ({ success: rateLimitSuccess }),
    },
    ADMIN_SECRET: { get: async () => adminSecret },
  } as unknown as Env;
}
