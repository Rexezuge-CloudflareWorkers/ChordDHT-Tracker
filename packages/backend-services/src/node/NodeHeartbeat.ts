import type { CrlDAO, NodeDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import { BadRequestError, NotFoundError } from '@chord-dht-tracker/backend-errors';
import { NODE_ID_PATTERN } from '@chord-dht-tracker/shared';
import type { HeartbeatBody } from '@chord-dht-tracker/shared';
import type { VNodeService } from '../vnode/VNodeService';

// HeartbeatCrl is the signed CRL payload piggybacked on heartbeat responses.
// Same shape as GET /tracker/crl; the client verifies the CA signature before
// applying it, exactly as with the standalone CRL endpoint.
interface HeartbeatCrl {
  version: number;
  updated_at: number;
  revoked_node_ids: string[];
  signature: string;
}

interface HeartbeatResult {
  acknowledged: boolean;
  tracker_time: string;
  vnodes?: { updated: number; errors: Array<{ vnode_id: string; code: string }> };
  // Latest CRL version known to the tracker (0 when none is stored).
  // Always present on success; absent only if the CRL lookup failed or the
  // caller hit the NotFound path. Old clients ignore it.
  crl_version?: number;
  // Inline signed CRL, present only when the request carried crl_version and
  // the tracker holds a newer version. Clients that omit crl_version (old
  // clients, CRL refresh disabled) never receive the payload.
  crl?: HeartbeatCrl;
}

interface NodeHeartbeatDeps {
  nodeDAO?: () => Promise<NodeDAO>;
  vnodeDAO?: () => Promise<VNodeDAO>;
  vnodeService?: () => Promise<VNodeService>;
  crlDAO?: () => Promise<CrlDAO>;
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
        return this.attachCrl({ acknowledged: true, tracker_time: nowIso }, body);
      }
      const vnodeService = await this.deps.vnodeService();
      const vnodes = await vnodeService.applyBatchedHeartbeats(nodeId, batchRaw, nowUnix);
      return this.attachCrl({ acknowledged: true, tracker_time: nowIso, vnodes }, body);
    }
    const vnodeDAO = await this.deps.vnodeDAO();
    if ((await vnodeDAO.heartbeatDirect(nodeId, body, nowUnix)) === 0) {
      throw new NotFoundError(`Node ${nodeId} not found`);
    }
    return this.attachCrl({ acknowledged: true, tracker_time: nowIso }, body);
  }

  // attachCrl piggybacks the latest CRL onto a heartbeat result. The inline
  // payload is opt-in: only requests carrying crl_version receive it, and only
  // when the tracker holds a newer version. Best-effort by design — a CRL
  // lookup failure must never fail the heartbeat; the client retries on its
  // next heartbeat (GET /tracker/crl remains the fallback).
  private async attachCrl(result: HeartbeatResult, body: HeartbeatBody): Promise<HeartbeatResult> {
    try {
      const crlDAO = await this.deps.crlDAO();
      const latestVersion = await crlDAO.getLatestVersion();
      result.crl_version = latestVersion ?? 0;
      const clientVersion = (body as { crl_version?: unknown }).crl_version;
      if (
        latestVersion !== null &&
        typeof clientVersion === 'number' &&
        Number.isSafeInteger(clientVersion) &&
        clientVersion >= 0 &&
        clientVersion < latestVersion
      ) {
        const latestJson = await crlDAO.getLatest();
        if (latestJson) {
          result.crl = JSON.parse(latestJson) as HeartbeatCrl;
        }
      }
    } catch {
      // Best-effort: return the heartbeat result without CRL fields.
    }
    return result;
  }
}

export { NodeHeartbeat };
export type { HeartbeatCrl, HeartbeatResult, NodeHeartbeatDeps };
