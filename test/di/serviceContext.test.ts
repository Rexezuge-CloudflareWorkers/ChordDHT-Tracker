import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import { createServiceContext } from '@chord-dht-tracker/backend-runtime/di';
import { ConsoleLogger, FixedClock, NullLogger, SystemClock } from '@chord-dht-tracker/shared/utils';

const env = { DB: {} } as unknown as ServiceEnv;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createServiceContext', () => {
  it('passes the env through with default logger and clock', () => {
    const context = createServiceContext(env);

    expect(context.env).toBe(env);
    expect(context.logger).toBeInstanceOf(ConsoleLogger);
    expect(context.clock).toBeInstanceOf(SystemClock);
  });

  it('honours logger and clock overrides', () => {
    const logger = new NullLogger();
    const clock = new FixedClock(1_700_000_000_000);

    const context = createServiceContext(env, { logger, clock });

    expect(context.logger).toBe(logger);
    expect(context.clock).toBe(clock);
    expect(context.clock.nowMs()).toBe(1_700_000_000_000);
  });

  it('allows partial overrides', () => {
    const clock = new FixedClock(42);

    const context = createServiceContext(env, { clock });

    expect(context.logger).toBeInstanceOf(ConsoleLogger);
    expect(context.clock).toBe(clock);
  });
});
