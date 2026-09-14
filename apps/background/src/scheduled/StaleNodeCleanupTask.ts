import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import type { RequestScopeEnv } from '@chord-dht-tracker/backend-services/composition';
import { AbstractScheduledTask } from './IScheduledTask';
import type { TaskRunSummary } from './IScheduledTask';

// Hourly stale-node cleanup, resolved through the service composition root —
// never `new MaintenanceService(env)` or `@/db` helpers. `runCleanup()` is the
// service-layer equivalent of the former `cleanupStaleNodes` db helper (stale
// vnodes, then stale anchors, then orphaned vnodes, then a vnode_count
// recount); over-limit eviction stays at registration time in the service
// layer (`NodeRegistration`), so the hourly job keeps its previous behavior.
class StaleNodeCleanupTask extends AbstractScheduledTask {
  protected override async handleScheduledTask(): Promise<TaskRunSummary> {
    const scope = createRequestScope(this.env as RequestScopeEnv);
    const maintenance = scope.get(Tokens.MaintenanceService);
    const summary = await maintenance.runCleanup(this.event.scheduledTime);
    console.log(
      `StaleNodeCleanupTask: deleted ${summary.deletedAnchors} anchors, ${summary.deletedVnodes} vnodes, ${summary.orphanVnodes} orphans`,
    );
    return {
      itemsProcessed: summary.deletedAnchors + summary.deletedVnodes + summary.orphanVnodes,
      itemsFailed: 0,
      summary: `deleted ${summary.deletedAnchors} anchors, ${summary.deletedVnodes} vnodes, ${summary.orphanVnodes} orphans`,
    };
  }
}

export { StaleNodeCleanupTask };
