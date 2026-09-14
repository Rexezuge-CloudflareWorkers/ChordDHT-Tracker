import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import { AuthService } from '@chord-dht-tracker/backend-services/auth';

const SECRET = 'test-secret';

function setup(secret: string | null = SECRET, throws = false) {
  const get = throws ? vi.fn().mockRejectedValue(new Error('store down')) : vi.fn().mockResolvedValue(secret);
  const service = new AuthService({ ADMIN_SECRET: { get } } as unknown as ServiceEnv);
  return { service, get };
}

function authedRequest(token?: string): Request {
  const headers = token === undefined ? {} : { Authorization: `Bearer ${token}` };
  return new Request('http://localhost/tracker/admin/verify', { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthService', () => {
  it('accepts the configured admin token', async () => {
    const { service } = setup();

    await expect(service.isAdmin(authedRequest(SECRET))).resolves.toBe(true);
  });

  it('rejects wrong, missing, and malformed credentials', async () => {
    const { service } = setup();

    await expect(service.isAdmin(authedRequest('wrong'))).resolves.toBe(false);
    await expect(service.isAdmin(new Request('http://localhost/'))).resolves.toBe(false);
    await expect(service.isAdmin(new Request('http://localhost/', { headers: { Authorization: 'Basic abc' } }))).resolves.toBe(false);
    await expect(service.isAdmin(authedRequest(''))).resolves.toBe(false);
  });

  it('rejects when no secret is configured', async () => {
    const { service: missing } = setup(null);
    const { service: placeholder } = setup('UNCONFIGURED');

    await expect(missing.isAdmin(authedRequest(SECRET))).resolves.toBe(false);
    await expect(placeholder.isAdmin(authedRequest(SECRET))).resolves.toBe(false);
  });

  it('rejects when the secret store fails', async () => {
    const { service } = setup(SECRET, true);

    await expect(service.isAdmin(authedRequest(SECRET))).resolves.toBe(false);
  });
});
