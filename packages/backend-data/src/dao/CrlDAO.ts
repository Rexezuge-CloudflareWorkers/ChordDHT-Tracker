import { DatabaseError } from '@chord-dht-tracker/backend-errors';
import { executeD1WithRetry, isD1ErrorRetryable } from '../utils';
import { BaseDAO } from './BaseDAO';

function toDatabaseError(error: unknown, context: string): DatabaseError {
  if (error instanceof DatabaseError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new DatabaseError(`Failed to ${context}: ${message}`, isD1ErrorRetryable(message));
}

// CrlDAO owns the `crl` table. SQL is copied verbatim from the
// tracker CRL endpoint files.
class CrlDAO extends BaseDAO {
  public async getLatest(): Promise<string | null> {
    try {
      const row = await this.database
        .prepare('SELECT crl_json FROM crl ORDER BY id DESC LIMIT 1')
        .first<{ crl_json: string }>();
      return row?.crl_json ?? null;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'get latest CRL');
    }
  }

  public async getLatestVersion(): Promise<number | null> {
    try {
      const row = await this.database
        .prepare('SELECT version FROM crl ORDER BY id DESC LIMIT 1')
        .first<{ version: number }>();
      return row?.version ?? null;
    } catch (error: unknown) {
      throw toDatabaseError(error, 'get latest CRL version');
    }
  }

  public async insert(version: number, updatedAt: number, crlJson: string): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('INSERT INTO crl (version, updated_at, crl_json) VALUES (?, ?, ?)')
          .bind(version, updatedAt, crlJson)
          .run(),
      'insert CRL',
    );
  }
}

export { CrlDAO };
