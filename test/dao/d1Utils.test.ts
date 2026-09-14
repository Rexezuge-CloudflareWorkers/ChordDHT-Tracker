import { describe, expect, it, vi } from 'vitest';
import { DatabaseError } from '@chord-dht-tracker/backend-errors';
import { assertD1Success, executeD1WithRetry } from '@chord-dht-tracker/backend-data/utils';

describe('assertD1Success', () => {
  it('passes successful results through', () => {
    expect(() => assertD1Success({ success: true } as D1Result, 'test op')).not.toThrow();
  });

  it('throws DatabaseError for failed results', () => {
    expect(() => assertD1Success({ success: false, error: 'boom' } as D1Result, 'test op')).toThrow(DatabaseError);
  });
});

describe('executeD1WithRetry', () => {
  it('returns the first successful result', async () => {
    const operation = vi.fn().mockResolvedValue({ success: true, meta: { changes: 2 } });
    await expect(executeD1WithRetry(operation, 'test op')).resolves.toEqual({ success: true, meta: { changes: 2 } });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('wraps unsuccessful results in DatabaseError', async () => {
    const operation = vi.fn().mockResolvedValue({ success: false, error: 'disk I/O error' });
    await expect(executeD1WithRetry(operation, 'test op', { maxRetries: 0 })).rejects.toBeInstanceOf(DatabaseError);
  });

  it('retries retryable failures then succeeds', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('database is locked'))
      .mockResolvedValueOnce({ success: true, meta: {} });
    await expect(
      executeD1WithRetry(operation, 'test op', { maxRetries: 2, baseDelayMs: 1 }),
    ).resolves.toEqual({ success: true, meta: {} });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('gives up after max retries on persistent retryable failures', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('database is locked'));
    await expect(executeD1WithRetry(operation, 'test op', { maxRetries: 1, baseDelayMs: 1 })).rejects.toBeInstanceOf(
      DatabaseError,
    );
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable failures', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('no such table: nodes'));
    await expect(executeD1WithRetry(operation, 'test op', { maxRetries: 3, baseDelayMs: 1 })).rejects.toBeInstanceOf(
      DatabaseError,
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
