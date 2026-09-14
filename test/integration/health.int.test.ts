import { beforeAll, describe, expect, it } from 'vitest';
import { api, setupIntegration } from './helpers/setup';

beforeAll(async () => {
  await setupIntegration();
});

describe('GET /tracker/health', () => {
  it('returns ok with uptime and timestamp', async () => {
    const res = await api('/tracker/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; uptime_seconds: number; timestamp: string };
    expect(body.status).toBe('ok');
    expect(typeof body.uptime_seconds).toBe('number');
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('reports non-decreasing uptime across calls', async () => {
    const first = (await (await api('/tracker/health')).json()) as { uptime_seconds: number };
    const second = (await (await api('/tracker/health')).json()) as { uptime_seconds: number };
    expect(second.uptime_seconds).toBeGreaterThanOrEqual(first.uptime_seconds);
  });
});
