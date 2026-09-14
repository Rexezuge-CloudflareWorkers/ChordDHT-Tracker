import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrlDAO } from '@chord-dht-tracker/backend-data/dao';
import { BadRequestError, InternalServerError, NotFoundError } from '@chord-dht-tracker/backend-errors';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import type { CertService } from '@chord-dht-tracker/backend-services/auth';
import { CrlService } from '@chord-dht-tracker/backend-services/crl';

const CRL_JSON = '{"version":2,"updated_at":1780000000,"revoked_node_ids":[]}';

function setup() {
  const crlDAO = {
    getLatest: vi.fn().mockResolvedValue(CRL_JSON),
    getLatestVersion: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue(undefined),
  };
  const certService = {
    getCAPublicKey: vi.fn().mockResolvedValue({} as CryptoKey),
    verifyCRL: vi.fn().mockResolvedValue(true),
  };
  const service = new CrlService({ DB: {} } as unknown as ServiceEnv, {
    crlDAO: () => Promise.resolve(crlDAO as unknown as CrlDAO),
    certService: () => Promise.resolve(certService as unknown as CertService),
  });
  return { service, crlDAO, certService };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CrlService reads', () => {
  it('returns the latest stored CRL', async () => {
    const { service } = setup();

    await expect(service.getLatest()).resolves.toBe(CRL_JSON);
  });

  it('throws NotFound when no CRL is stored', async () => {
    const { service, crlDAO } = setup();
    crlDAO.getLatest.mockResolvedValue(null);

    await expect(service.getLatest()).rejects.toThrow(NotFoundError);
  });
});

describe('CrlService uploads', () => {
  const validInput = {
    version: 3,
    updated_at: 1780000000,
    revoked_node_ids: ['a'.repeat(40), 'b'.repeat(40)],
    signature: 'sig',
  };

  it('stores a valid CRL and returns the summary', async () => {
    const { service, crlDAO, certService } = setup();

    const result = await service.upload({ ...validInput });

    expect(result).toEqual({ updated: true, version: 3, revoked_count: 2 });
    expect(certService.verifyCRL).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3, updated_at: 1780000000 }),
      expect.anything(),
    );
    expect(crlDAO.insert).toHaveBeenCalledWith(3, 1780000000, JSON.stringify({ ...validInput }));
  });

  it('rejects malformed CRL bodies', async () => {
    const { service } = setup();

    await expect(service.upload({ ...validInput, version: '3' })).rejects.toThrow(BadRequestError);
    await expect(service.upload({ ...validInput, updated_at: 'now' })).rejects.toThrow(BadRequestError);
    await expect(service.upload({ ...validInput, revoked_node_ids: 'nope' })).rejects.toThrow(BadRequestError);
    await expect(service.upload({ ...validInput, signature: undefined })).rejects.toThrow(BadRequestError);
  });

  it('fails when the CA key is not configured', async () => {
    const { service, certService } = setup();
    certService.getCAPublicKey.mockResolvedValue(null);

    await expect(service.upload({ ...validInput })).rejects.toThrow(InternalServerError);
  });

  it('rejects CRLs with bad signatures', async () => {
    const { service, certService } = setup();
    certService.verifyCRL.mockResolvedValue(false);

    await expect(service.upload({ ...validInput })).rejects.toThrow(/signature verification failed/);
  });

  it('rejects non-monotonic versions', async () => {
    const { service, crlDAO } = setup();
    crlDAO.getLatestVersion.mockResolvedValue(5);

    await expect(service.upload({ ...validInput, version: 5 })).rejects.toThrow(/VERSION_CONFLICT/);
    expect(crlDAO.insert).not.toHaveBeenCalled();
  });

  it('accepts a version greater than the stored one', async () => {
    const { service, crlDAO } = setup();
    crlDAO.getLatestVersion.mockResolvedValue(2);

    const result = await service.upload({ ...validInput });

    expect(result.version).toBe(3);
    expect(crlDAO.insert).toHaveBeenCalled();
  });
});
