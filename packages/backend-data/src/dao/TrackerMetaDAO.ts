import { DatabaseError } from '@chord-dht-tracker/backend-errors';
import { executeD1WithRetry, isD1ErrorRetryable } from '../utils';
import { BaseDAO } from './BaseDAO';

function toDatabaseError(error: unknown, context: string): DatabaseError {
  if (error instanceof DatabaseError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new DatabaseError(`Failed to ${context}: ${message}`, isD1ErrorRetryable(message));
}

// TrackerMetaDAO owns the `tracker_meta` key/value table. SQL is copied
// verbatim from apps/api/src/db.ts.
class TrackerMetaDAO extends BaseDAO {
  public async ensureStartedAt(nowIso: string): Promise<string> {
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare("INSERT OR IGNORE INTO tracker_meta (key, value) VALUES ('started_at', ?)")
          .bind(nowIso)
          .run(),
      'ensure tracker started_at',
    );
    try {
      const row = await this.database
        .prepare("SELECT value FROM tracker_meta WHERE key = 'started_at'")
        .first<{ value: string }>();
      if (!row) {
        throw new DatabaseError('Failed to load tracker start time after insert.');
      }
      return row.value;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'get tracker started_at');
    }
  }
}

export { TrackerMetaDAO };
