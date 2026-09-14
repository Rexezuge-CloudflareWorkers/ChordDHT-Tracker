import { describe, expect, it, vi } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1 } from '../mocks/d1';
import { createEnv } from '../mocks/env';

function createScheduledEnv(fetchImpl: (req: Request) => Promise<Response>) {
  const db = createD1();
  const env = createEnv(db);
  const stubFetch = vi.fn(fetchImpl);
  const stub = { fetch: stubFetch };
  const get = vi.fn().mockReturnValue(stub);
  const idFromName = vi.fn().mockReturnValue('global-id');
  return { env: { ...env, CRON_TASKS: { idFromName, get } } as unknown as Env, stubFetch, get, idFromName };
}

function flushWaitUntil() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ChordDHTTrackerWorker.scheduled', () => {
  it('forwards cron payload to the CRON_TASKS DO via waitUntil', async () => {
    const { env, stubFetch, get, idFromName } = createScheduledEnv(async () => new Response('{}', { status: 200 }));
    const worker = new ChordDHTTrackerWorker();
    const waitUntil = vi.fn();
    const ctx = { waitUntil } as unknown as ExecutionContext;
    const event = { cron: '0 * * * *', scheduledTime: 1_700_000_000_000, noRetry: () => undefined } as ScheduledController;

    await worker.scheduled(event, env, ctx);
    expect(idFromName).toHaveBeenCalledWith('global');
    expect(get).toHaveBeenCalledWith('global-id');
    expect(waitUntil).toHaveBeenCalledTimes(1);

    await flushWaitUntil();
    expect(stubFetch).toHaveBeenCalledTimes(1);
    const req = stubFetch.mock.calls[0][0] as Request;
    expect(req.method).toBe('POST');
    expect(req.url).toContain('/run');
    expect(await req.json()).toEqual({ cron: '0 * * * *', scheduledTime: 1_700_000_000_000 });
  });

  it('logs but does not throw when the DO fetch fails', async () => {
    const { env } = createScheduledEnv(async () => {
      throw new Error('boom');
    });
    const worker = new ChordDHTTrackerWorker();
    const waitUntil = vi.fn((p: Promise<unknown>) => p.catch(() => undefined));
    const ctx = { waitUntil } as unknown as ExecutionContext;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const event = { cron: '0 * * * *', scheduledTime: 1, noRetry: () => undefined } as ScheduledController;
      await worker.scheduled(event, env, ctx);
      await flushWaitUntil();
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
