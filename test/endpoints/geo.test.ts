import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1 } from '../mocks/d1';
import { createEnv } from '../mocks/env';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /tracker/geo', () => {
  it('returns null region and country without Cloudflare context', async () => {
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/geo'),
      createEnv(createD1()),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { region: unknown; country: unknown };
    expect(body).toEqual({ region: null, country: null });
  });

  it('falls back to the cf-ipcountry header for Orange-to-Orange requests', async () => {
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/geo', { headers: { 'cf-ipcountry': 'DE' } }),
      createEnv(createD1()),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { region: unknown; country: unknown };
    expect(body).toEqual({ region: null, country: 'DE' });
  });

  it('prefers Cloudflare region and country when present', async () => {
    const worker = new ChordDHTTrackerWorker();
    const req = new Request('http://localhost/tracker/geo', { headers: { 'cf-ipcountry': 'US' } });
    (req as unknown as Record<string, unknown>).cf = { region: 'IAD', country: 'US' };
    const res = await worker.fetch(req, createEnv(createD1()), {} as ExecutionContext);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { region: unknown; country: unknown };
    expect(body).toEqual({ region: 'IAD', country: 'US' });
  });
});
