import { beforeAll, describe, expect, it } from 'vitest';
import { api, setupIntegration } from '../helpers/setup';

beforeAll(async () => {
  await setupIntegration();
});

describe('GET /tracker/geo', () => {
  it('returns null region/country without Cloudflare geo context', async () => {
    const res = await api('/tracker/geo');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ region: null, country: null });
  });

  it('falls back to the cf-ipcountry header for country', async () => {
    const res = await api('/tracker/geo', { headers: { 'cf-ipcountry': 'DE' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ region: null, country: 'DE' });
  });

  it('ignores region-like headers (only cf.region feeds region)', async () => {
    const res = await api('/tracker/geo', { headers: { 'cf-ipcountry': 'FR', region: 'spoofed' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ region: null, country: 'FR' });
  });
});
