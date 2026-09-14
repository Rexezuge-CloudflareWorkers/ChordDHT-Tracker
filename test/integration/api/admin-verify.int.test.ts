import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_SECRET_VALUE, adminHeaders, api, setupIntegration } from '../helpers/setup';

beforeAll(async () => {
  await setupIntegration();
});

describe('GET /tracker/admin/verify', () => {
  it('rejects requests without a token', async () => {
    const res = await api('/tracker/admin/verify');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('Unauthorized');
  });

  it('rejects requests with a wrong token', async () => {
    const res = await api('/tracker/admin/verify', { headers: { Authorization: 'Bearer wrong-secret' } });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('Unauthorized');
  });

  it('accepts the configured admin secret', async () => {
    const res = await api('/tracker/admin/verify', { headers: adminHeaders() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ admin: true });
    expect(ADMIN_SECRET_VALUE.length).toBeGreaterThan(0);
  });
});
