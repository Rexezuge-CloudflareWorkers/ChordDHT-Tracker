import { vi } from 'vitest';
import { createStmt } from '../mocks/d1';
import type { StmtConfig } from '../mocks/d1';

/**
 * Wraps createStmt so the D1Result-returning run()/all() include
 * `success: true`. DAO methods route writes and list queries through
 * executeD1WithRetry, which treats a missing `success` flag as a failure,
 * so the bare createStmt shape would throw DatabaseError for every write.
 */
export function okStmt(config: StmtConfig = {}) {
  const stmt = createStmt(config);
  (stmt.run as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    meta: { changes: config.changes ?? 1 },
  });
  (stmt.all as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    results: config.allResults ?? [],
  });
  return stmt;
}
