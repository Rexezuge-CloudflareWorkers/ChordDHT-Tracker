export function createEnv(db: D1Database, rateLimitSuccess = true): Env {
  return {
    DB: db,
    MAX_NODES: '1000',
    STALE_THRESHOLD_SECONDS: '180',
    NODE_RATE_LIMITER: {
      limit: async (_opts: { key: string }) => ({ success: rateLimitSuccess }),
    },
  } as unknown as Env;
}
