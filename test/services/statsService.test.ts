import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeDAO, TrackerMetaDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import { StatsService } from '@chord-dht-tracker/backend-services/stats';
import { FixedClock } from '@chord-dht-tracker/shared/utils';

const NOW_MS = new Date('2026-06-01T00:00:00.000Z').getTime();
const NOW_ISO = new Date(NOW_MS).toISOString();

const anchorRow = {
  total_nodes: 5,
  active_nodes: 3,
  isolated_nodes: 1,
  leaving_nodes: 0,
  stale_nodes: 1,
  avg_finger_table_coverage: 0.8,
  avg_uptime_seconds: 1200,
  oldest_node_joined_at: '2026-05-27T10:00:00.000Z',
  newest_node_joined_at: '2026-05-28T06:00:00.000Z',
  expiring_cert_nodes: 2,
  active_maintenance_nodes: 1,
  avg_cache_hit_rate: 0.75,
};

const vnodeRow = {
  total_nodes: 8,
  active_nodes: 6,
  isolated_nodes: 1,
  leaving_nodes: 1,
  stale_nodes: 2,
  avg_finger_table_coverage: 0.7,
  avg_uptime_seconds: 900,
  // Vnode aggregates use unix seconds and must be normalized to ISO.
  oldest_node_joined_at: Math.floor(new Date('2026-05-27T12:00:00.000Z').getTime() / 1000),
  newest_node_joined_at: Math.floor(new Date('2026-05-28T08:00:00.000Z').getTime() / 1000),
  expiring_cert_nodes: 0,
  active_maintenance_nodes: 3,
  avg_cache_hit_rate: 0.6,
};

function setup(vars: Record<string, string> = {}) {
  const nodeDAO = { statsAnchors: vi.fn().mockResolvedValue(null) };
  const vnodeDAO = { statsVnodes: vi.fn().mockResolvedValue(null) };
  const metaDAO = { ensureStartedAt: vi.fn().mockResolvedValue(new Date(NOW_MS - 7200_000).toISOString()) };
  const config = AppConfiguration.fromEnv({ STALE_THRESHOLD_SECONDS: '600', ...vars });
  const service = new StatsService({ DB: {} } as unknown as ServiceEnv, {
    nodeDAO: () => Promise.resolve(nodeDAO as unknown as NodeDAO),
    vnodeDAO: () => Promise.resolve(vnodeDAO as unknown as VNodeDAO),
    metaDAO: () => Promise.resolve(metaDAO as unknown as TrackerMetaDAO),
    config,
  });
  return { service, nodeDAO, vnodeDAO, metaDAO };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StatsService', () => {
  it('aggregates anchor and vnode summaries with tracker metadata', async () => {
    const { service, nodeDAO, vnodeDAO, metaDAO } = setup();
    nodeDAO.statsAnchors.mockResolvedValue(anchorRow);
    vnodeDAO.statsVnodes.mockResolvedValue(vnodeRow);
    const clock = new FixedClock(NOW_MS);

    const result = await service.getStats(new Date(clock.nowMs()));

    expect(result.anchor_nodes).toEqual(anchorRow);
    expect(result.vnodes).toEqual({
      ...vnodeRow,
      oldest_node_joined_at: '2026-05-27T12:00:00.000Z',
      newest_node_joined_at: '2026-05-28T08:00:00.000Z',
    });
    expect(result.tracker_uptime_seconds).toBe(7200);
    expect(result.stale_threshold_seconds).toBe(600);
    expect(result.stats_generated_at).toBe(NOW_ISO);
    expect(metaDAO.ensureStartedAt).toHaveBeenCalledWith(NOW_ISO);
  });

  it('binds the stale and cert-expiry cutoffs from config and clock', async () => {
    const { service, nodeDAO, vnodeDAO } = setup({ STALE_THRESHOLD_SECONDS: '300' });
    const clock = new FixedClock(NOW_MS);

    await service.getStats(new Date(clock.nowMs()));

    expect(nodeDAO.statsAnchors).toHaveBeenCalledWith(
      new Date(NOW_MS - 300_000).toISOString(),
      Math.floor(NOW_MS / 1000) + 30 * 86400,
    );
    expect(vnodeDAO.statsVnodes).toHaveBeenCalledWith(Math.floor(NOW_MS / 1000) - 300);
  });

  it('normalizes empty aggregates to zeroed summaries', async () => {
    const { service } = setup();
    const clock = new FixedClock(NOW_MS);

    const result = await service.getStats(new Date(clock.nowMs()));

    expect(result.anchor_nodes.total_nodes).toBe(0);
    expect(result.anchor_nodes.avg_finger_table_coverage).toBeNull();
    expect(result.anchor_nodes.oldest_node_joined_at).toBeNull();
    expect(result.vnodes.total_nodes).toBe(0);
    expect(result.vnodes.avg_cache_hit_rate).toBeNull();
  });
});
