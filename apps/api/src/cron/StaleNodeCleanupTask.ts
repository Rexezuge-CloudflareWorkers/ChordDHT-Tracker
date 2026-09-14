import { cleanupStaleNodes, getStaleCleanupAfterHours, type StaleCleanupSummary } from '@/db';

class StaleNodeCleanupTask {
  async handle(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<StaleCleanupSummary> {
    const afterHours = getStaleCleanupAfterHours(env);
    const nowMs = event.scheduledTime;
    const db = env.DB.withSession('first-primary');
    const summary = await cleanupStaleNodes(db, nowMs, afterHours);
    console.log(
      `StaleNodeCleanupTask: deleted ${summary.deletedAnchors} anchors, ${summary.deletedVnodes} vnodes, ${summary.orphanVnodes} orphans (afterHours=${afterHours})`,
    );
    return summary;
  }
}

export { StaleNodeCleanupTask };
