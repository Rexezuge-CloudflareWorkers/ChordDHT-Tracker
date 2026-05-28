export function createEnv(db: D1Database): Env {
  return {
    DB: db,
    MAX_NODES: '1000',
    STALE_THRESHOLD_SECONDS: '180',
  } as Env;
}
