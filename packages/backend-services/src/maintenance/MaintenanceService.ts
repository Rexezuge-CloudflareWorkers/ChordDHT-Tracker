import { NodeDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import type { D1Queryable } from '@chord-dht-tracker/backend-data/utils';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';

interface StaleCleanupSummary {
  deletedAnchors: number;
  deletedVnodes: number;
  orphanVnodes: number;
}

interface MaintenanceServiceDeps {
  nodeDAO?: () => Promise<NodeDAO>;
  vnodeDAO?: () => Promise<VNodeDAO>;
  config?: AppConfiguration;
}

// MaintenanceService coordinates stale-row cleanup: stale vnodes first, then
// stale anchors, then vnodes orphaned by anchor deletion (D1 enforces no FKs),
// finally a vnode_count recount on surviving anchors.
class MaintenanceService {
  private readonly deps: Required<MaintenanceServiceDeps>;

  constructor(
    private readonly env: ServiceEnv,
    deps: MaintenanceServiceDeps = {},
  ) {
    const db = env.DB as D1Queryable;
    this.deps = {
      nodeDAO: () => Promise.resolve(new NodeDAO(db)),
      vnodeDAO: () => Promise.resolve(new VNodeDAO(db)),
      config: AppConfiguration.fromEnv(env),
      ...deps,
    };
  }

  public async runCleanup(nowMs: number = Date.now(), afterHours?: number): Promise<StaleCleanupSummary> {
    const hours =
      afterHours !== undefined && Number.isFinite(afterHours) && afterHours > 0
        ? afterHours
        : this.deps.config.getCleanupAfterHours();
    const cutoffUnix = Math.floor(nowMs / 1000) - Math.floor(hours * 3600);
    const cutoffIso = new Date(cutoffUnix * 1000).toISOString();

    const nodeDAO = await this.deps.nodeDAO();
    const vnodeDAO = await this.deps.vnodeDAO();
    const deletedVnodes = await vnodeDAO.deleteStale(cutoffUnix);
    const deletedAnchors = await nodeDAO.deleteStaleAnchors(cutoffIso);
    const orphanVnodes = await vnodeDAO.deleteOrphans();
    await nodeDAO.recountAllVnodeCounts();
    return { deletedAnchors, deletedVnodes, orphanVnodes };
  }
}

export { MaintenanceService };
export type { MaintenanceServiceDeps, StaleCleanupSummary };
