import type { NodeDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import { BadRequestError, NotFoundError } from '@chord-dht-tracker/backend-errors';
import { NODE_ID_PATTERN } from '@chord-dht-tracker/shared';
import type { HeartbeatBody } from '@chord-dht-tracker/shared';
import type { VNodeService } from '../vnode/VNodeService';

interface HeartbeatResult {
  acknowledged: boolean;
  tracker_time: string;
  vnodes?: { updated: number; errors: Array<{ vnode_id: string; code: string }> };
}

interface NodeHeartbeatDeps {
  nodeDAO?: () => Promise<NodeDAO>;
  vnodeDAO?: () => Promise<VNodeDAO>;
  vnodeService?: () => Promise<VNodeService>;
}

// NodeHeartbeat owns anchor/vnode liveness updates.
// Moved verbatim from NodeService; no direct D1 access here.
class NodeHeartbeat {
  private readonly deps: Required<NodeHeartbeatDeps>;

  constructor(deps: Required<NodeHeartbeatDeps>) {
    this.deps = deps;
  }

  public async heartbeat(nodeId: string, body: HeartbeatBody): Promise<HeartbeatResult> {
    if (!NODE_ID_PATTERN.test(nodeId)) {
      throw new BadRequestError('node_id must be a 40-character lowercase hex string');
    }
    const now = new Date();
    const nowIso = now.toISOString();
    const nowUnix = Math.floor(now.getTime() / 1000);
    const nodeDAO = await this.deps.nodeDAO();
    if ((await nodeDAO.heartbeatAnchor(nodeId, body, nowIso)) > 0) {
      const batchRaw = (body as { vnode_heartbeats?: unknown }).vnode_heartbeats;
      if (batchRaw === undefined || (Array.isArray(batchRaw) && batchRaw.length === 0)) {
        return { acknowledged: true, tracker_time: nowIso };
      }
      const vnodeService = await this.deps.vnodeService();
      const vnodes = await vnodeService.applyBatchedHeartbeats(nodeId, batchRaw, nowUnix);
      return { acknowledged: true, tracker_time: nowIso, vnodes };
    }
    const vnodeDAO = await this.deps.vnodeDAO();
    if ((await vnodeDAO.heartbeatDirect(nodeId, body, nowUnix)) === 0) {
      throw new NotFoundError(`Node ${nodeId} not found`);
    }
    return { acknowledged: true, tracker_time: nowIso };
  }
}

export { NodeHeartbeat };
export type { HeartbeatResult, NodeHeartbeatDeps };
