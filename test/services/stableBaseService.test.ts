import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeDAO } from '@chord-dht-tracker/backend-data/dao';
import { InternalServerError } from '@chord-dht-tracker/backend-errors';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import type { CertService } from '@chord-dht-tracker/backend-services/auth';
import { StableBaseService } from '@chord-dht-tracker/backend-services/stable-base';
import { FixedClock } from '@chord-dht-tracker/shared/utils';

const URI_A = 'https://anchor-a.example.com';
const URI_B = 'https://anchor-b.example.com';
const ID_A = 'a'.repeat(40);
const ID_B = 'b'.repeat(40);
const NOW_MS = new Date('2026-06-01T00:00:00.000Z').getTime();
const NOW_ISO = new Date(NOW_MS).toISOString();
const FRESH = NOW_ISO;
const STALE = new Date(NOW_MS - 3600_000).toISOString();

function setup(vars: Record<string, string> = {}) {
  const nodeDAO = { stableBaseLookup: vi.fn().mockResolvedValue([]) };
  const certService = {
    normalizeURI: vi.fn((uri: string) => uri.trim()),
    hashURI: vi.fn(async (uri: string) => (uri === URI_A ? ID_A : ID_B)),
  };
  const config = AppConfiguration.fromEnv({
    STABLE_BASE_MEMBERS: `${URI_A},${URI_B}`,
    STABLE_BASE_MIN_SIZE: '2',
    STALE_THRESHOLD_SECONDS: '600',
    ...vars,
  });
  const service = new StableBaseService({ DB: {} } as unknown as ServiceEnv, {
    nodeDAO: () => Promise.resolve(nodeDAO as unknown as NodeDAO),
    certService: () => Promise.resolve(certService as unknown as CertService),
    config,
  });
  return { service, nodeDAO, certService };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StableBaseService', () => {
  it('reports a healthy stable base when enough members are live', async () => {
    const { service, nodeDAO } = setup();
    nodeDAO.stableBaseLookup.mockResolvedValue([
      { node_id: ID_A, uri: URI_A, status: 'ACTIVE', last_seen: FRESH },
      { node_id: ID_B, uri: URI_B, status: 'ACTIVE', last_seen: FRESH },
    ]);
    const clock = new FixedClock(NOW_MS);

    const result = await service.getStableBase(new Date(clock.nowMs()));

    expect(result.live_count).toBe(2);
    expect(result.configured_count).toBe(2);
    expect(result.degraded).toBe(false);
    expect(result.emergency).toBe(false);
    expect(result.emergency_threshold).toBe(2);
    expect(result.stale_threshold_seconds).toBe(600);
    expect(result.checked_at).toBe(NOW_ISO);
    expect(result.members.every((member) => member.live && member.registered)).toBe(true);
    expect(nodeDAO.stableBaseLookup).toHaveBeenCalledWith([ID_A, ID_B]);
  });

  it('marks stale and missing members as not live', async () => {
    const { service, nodeDAO } = setup();
    nodeDAO.stableBaseLookup.mockResolvedValue([
      { node_id: ID_A, uri: URI_A, status: 'ACTIVE', last_seen: STALE },
    ]);
    const clock = new FixedClock(NOW_MS);

    const result = await service.getStableBase(new Date(clock.nowMs()));

    expect(result.live_count).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.emergency).toBe(true);
    expect(result.members[0]).toMatchObject({ node_id: ID_A, registered: true, live: false });
    expect(result.members[1]).toMatchObject({ node_id: ID_B, registered: false, live: false, status: null, last_seen: null });
  });

  it('distinguishes degraded from emergency', async () => {
    const { service, nodeDAO } = setup({ STABLE_BASE_MIN_SIZE: '3' });
    nodeDAO.stableBaseLookup.mockResolvedValue([
      { node_id: ID_A, uri: URI_A, status: 'ACTIVE', last_seen: FRESH },
      { node_id: ID_B, uri: URI_B, status: 'ACTIVE', last_seen: FRESH },
    ]);
    const clock = new FixedClock(NOW_MS);

    const result = await service.getStableBase(new Date(clock.nowMs()));

    // minSize 3 → emergency threshold floor(3/2)+1 = 2; live 2 is degraded but not emergency.
    expect(result.degraded).toBe(true);
    expect(result.emergency).toBe(false);
    expect(result.emergency_threshold).toBe(2);
  });

  it('treats non-ACTIVE members as not live', async () => {
    const { service, nodeDAO } = setup({ STABLE_BASE_MIN_SIZE: '1' });
    nodeDAO.stableBaseLookup.mockResolvedValue([
      { node_id: ID_A, uri: URI_A, status: 'LEAVING', last_seen: FRESH },
    ]);
    const clock = new FixedClock(NOW_MS);

    const result = await service.getStableBase(new Date(clock.nowMs()));

    expect(result.live_count).toBe(0);
    expect(result.degraded).toBe(true);
  });

  it('wraps invalid member URIs as internal errors', async () => {
    const { service, certService } = setup();
    certService.normalizeURI.mockImplementation(() => {
      throw new Error('uri must use https scheme');
    });

    await expect(service.getStableBase(new Date(NOW_MS))).rejects.toThrow(InternalServerError);
  });
});
