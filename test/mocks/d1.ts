import { vi } from 'vitest';

export interface StmtConfig {
  /** Number of rows affected, returned by .run() */
  changes?: number;
  /** Value returned by .first<T>() */
  firstResult?: unknown;
  /** Array returned by .all<T>() */
  allResults?: unknown[];
}

/** Creates a single mock prepared statement that can be chained with .bind(). */
export function createStmt(config: StmtConfig = {}) {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ meta: { changes: config.changes ?? 1 } }),
    first: vi.fn().mockResolvedValue(config.firstResult ?? null),
    all: vi.fn().mockResolvedValue({ results: config.allResults ?? [] }),
  };
  return stmt as unknown as D1PreparedStatement;
}

/**
 * Creates a mock D1Database whose prepare() returns each provided statement
 * in sequence (via mockReturnValueOnce), then falls back to a default empty stmt.
 */
export function createD1(...stmts: ReturnType<typeof createStmt>[]): D1Database {
  const mockPrepare = vi.fn();
  for (const stmt of stmts) {
    mockPrepare.mockReturnValueOnce(stmt);
  }
  mockPrepare.mockReturnValue(createStmt());
  return { prepare: mockPrepare } as unknown as D1Database;
}
