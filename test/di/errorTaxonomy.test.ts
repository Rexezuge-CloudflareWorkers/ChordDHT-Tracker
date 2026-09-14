import { describe, expect, it } from 'vitest';
import {
  BadRequestError,
  ConflictError,
  DatabaseError,
  DefaultInternalServerError,
  ForbiddenError,
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
  RateLimitedError,
  ServiceUnavailableError,
  UnauthorizedError,
} from '@chord-dht-tracker/backend-errors';

describe('error taxonomy', () => {
  it('maps each class to its status code and type', () => {
    expect([new BadRequestError().getErrorCode(), new BadRequestError().getErrorType()]).toEqual([400, 'BadRequest']);
    expect([new UnauthorizedError().getErrorCode(), new UnauthorizedError().getErrorType()]).toEqual([401, 'Unauthorized']);
    expect([new ForbiddenError().getErrorCode(), new ForbiddenError().getErrorType()]).toEqual([403, 'Forbidden']);
    expect([new NotFoundError().getErrorCode(), new NotFoundError().getErrorType()]).toEqual([404, 'NotFound']);
    expect([new MethodNotAllowedError().getErrorCode(), new MethodNotAllowedError().getErrorType()]).toEqual([
      405,
      'MethodNotAllowed',
    ]);
    expect([new ConflictError().getErrorCode(), new ConflictError().getErrorType()]).toEqual([409, 'Conflict']);
    expect([new RateLimitedError().getErrorCode(), new RateLimitedError().getErrorType()]).toEqual([429, 'RateLimited']);
    expect([new InternalServerError().getErrorCode(), new InternalServerError().getErrorType()]).toEqual([
      500,
      'InternalServerError',
    ]);
    expect([new ServiceUnavailableError().getErrorCode(), new ServiceUnavailableError().getErrorType()]).toEqual([
      503,
      'ServiceUnavailable',
    ]);
  });

  it('preserves custom messages and defaults', () => {
    expect(new BadRequestError('custom').getErrorMessage()).toBe('custom');
    expect(new NotFoundError().getErrorMessage()).toContain('not found');
    expect(new ConflictError().getErrorMessage()).toContain('conflicts');
    expect(new RateLimitedError().getErrorMessage()).toContain('Rate limit');
    expect(new ServiceUnavailableError().getErrorMessage()).toContain('unavailable');
    expect(DefaultInternalServerError.getErrorCode()).toBe(500);
    expect(DefaultInternalServerError.retryable).toBe(false);
  });

  it('DatabaseError carries the DatabaseError type and retryable flag', () => {
    const retryable = new DatabaseError('locked', true);
    expect(retryable.getErrorCode()).toBe(500);
    expect(retryable.getErrorType()).toBe('DatabaseError');
    expect(retryable.getErrorMessage()).toBe('locked');
    expect(retryable.retryable).toBe(true);
    const plain = new DatabaseError();
    expect(plain.retryable).toBe(false);
    expect(plain.getErrorMessage()).toContain('database');
  });
});
