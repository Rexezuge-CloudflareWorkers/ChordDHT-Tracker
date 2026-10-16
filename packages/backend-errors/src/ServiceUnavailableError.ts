import { ErrorCode, ServiceError } from './IServiceError';

class ServiceUnavailableError extends ServiceError {
  constructor(message = 'The service is temporarily unavailable.') {
    super(message);
  }

  public getErrorCode(): ErrorCode {
    return 503;
  }

  public getErrorType(): string {
    return 'ServiceUnavailable';
  }

  public getErrorMessage(): string {
    return this.message;
  }
}

export { ServiceUnavailableError };
