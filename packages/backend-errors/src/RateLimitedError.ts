import { ErrorCode, ServiceError } from './IServiceError';

class RateLimitedError extends ServiceError {
  constructor(message = 'Rate limit exceeded for this request.') {
    super(message);
  }

  public getErrorCode(): ErrorCode {
    return 429;
  }

  public getErrorType(): string {
    return 'RateLimited';
  }

  public getErrorMessage(): string {
    return this.message;
  }
}

export { RateLimitedError };
