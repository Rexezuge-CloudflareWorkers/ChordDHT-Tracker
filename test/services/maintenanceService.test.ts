import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import { MaintenanceService } from '@chord-dht-tracker/backend-services/maintenance';
import { FixedClock } from '@chord-dht-tracker/shared/utils';

const NOW_MS = 1_700_000_000_000;

function setup(vars: Record<string, string> = {}) {
  const nodeDAO = {
    deleteStaleAnchors: vi.fn().mockResolvedValue(2),
    recountAllVnodeCounts: vi.fn().mockResolvedValue(undefined),
  };
  const vnodeDAO = {
    deleteStale: vi.fn().mockResolvedValue(3),
    deleteOrphans: vi.fn().mockResolvedValue(1),
  };
  const config = AppConfiguration.fromEnv({ STALE_CLEANUP_AFTER_HOURS: '24', ...vars });
  const service = new MaintenanceService({ DB: {} } as unknown as ServiceEnv, {
    nodeDAO: () => Promise.resolve(nodeDAO as unknown as NodeDAO),
    vnodeDAO: () => Promise.resolve(vnodeDAO as unknown as VNodeDAO),
    config,
  });
  return { service, nodeDAO, vnodeDAO };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MaintenanceService', () => {
  it('cleans vnodes first, then anchors, orphans, and recounts', async () => {
    const { service, nodeDAO, vnodeDAO } = setup();
    const clock = new FixedClock(NOW_MS);

    const result = await service.runCleanup(clock.nowMs());

    expect(result).toEqual({ deletedAnchors: 2, deletedVnodes: 3, orphanVnodes: 1 });
    const cutoffUnix = Math.floor(NOW_MS / 1000) - 24 * 3600;
    expect(vnodeDAO.deleteStale).toHaveBeenCalledWith(cutoffUnix);
    expect(nodeDAO.deleteStaleAnchors).toHaveBeenCalledWith(new Date(cutoffUnix * 1000).toISOString());
    expect(vnodeDAO.deleteOrphans).toHaveBeenCalled();
    expect(nodeDAO.recountAllVnodeCounts).toHaveBeenCalled();
    const order = [
      vnodeDAO.deleteStale.mock.invocationCallOrder[0],
      nodeDAO.deleteStaleAnchors.mock.invocationCallOrder[0],
      vnodeDAO.deleteOrphans.mock.invocationCallOrder[0],
      nodeDAO.recountAllVnodeCounts.mock.invocationCallOrder[0],
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('honours an explicit after-hours window', async () => {
    const { service, vnodeDAO } = setup();

    await service.runCleanup(NOW_MS, 2);

    expect(vnodeDAO.deleteStale).toHaveBeenCalledWith(Math.floor(NOW_MS / 1000) - 2 * 3600);
  });

  it('falls back to config for non-positive or non-finite windows', async () => {
    const { service, vnodeDAO } = setup();
    const expected = Math.floor(NOW_MS / 1000) - 24 * 3600;

    await service.runCleanup(NOW_MS, 0);
    expect(vnodeDAO.deleteStale).toHaveBeenLastCalledWith(expected);

    await service.runCleanup(NOW_MS, Number.NaN);
    expect(vnodeDAO.deleteStale).toHaveBeenLastCalledWith(expected);

    await service.runCleanup(NOW_MS, -5);
    expect(vnodeDAO.deleteStale).toHaveBeenLastCalledWith(expected);
  });
});
