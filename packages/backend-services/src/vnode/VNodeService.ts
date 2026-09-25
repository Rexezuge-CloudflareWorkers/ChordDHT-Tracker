import { CryptoService } from '@chord-dht-tracker/backend-data/crypto';
import { VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import type { D1Queryable } from '@chord-dht-tracker/backend-data/utils';
import { BadRequestError } from '@chord-dht-tracker/backend-errors';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import { NODE_ID_PATTERN } from '@chord-dht-tracker/shared';
import type { VNodeHeartbeatBody, VNodeProof } from '@chord-dht-tracker/shared';

interface InlineVNodeEntry {
  vnode_id?: unknown;
  index?: unknown;
  proof?: unknown;
}

interface UpsertVNodeRequest {
  vnodeId: string;
  anchorId: string;
  vnodeIndex: number;
  proofJson: string;
  nowUnix: number;
}

interface BatchedHeartbeatResult {
  updated: number;
  errors: Array<{ vnode_id: string; code: string }>;
}

interface VNodeServiceDeps {
  vnodeDAO?: () => Promise<VNodeDAO>;
  crypto?: CryptoService;
  config?: AppConfiguration;
}

// VNodeService owns vnode identity (derive/verify, delegated to backend-data's
// CryptoService) and vnode writes. Anchor orchestration (registration,
// heartbeats, listing) lives in NodeService.
class VNodeService {
  private readonly deps: Required<VNodeServiceDeps>;

  constructor(
    private readonly env: ServiceEnv,
    deps: VNodeServiceDeps = {},
  ) {
    const db = env.DB as D1Queryable;
    this.deps = {
      vnodeDAO: () => Promise.resolve(new VNodeDAO(db)),
      crypto: new CryptoService(),
      config: AppConfiguration.fromEnv(env),
      ...deps,
    };
  }

  // deriveVNodeID computes SHA1("chord-vnode-v4\n" + anchorID + "\n" + index), matching Go.
  public async deriveVNodeID(anchorID: string, index: number): Promise<string> {
    return this.deps.crypto.deriveVNodeID(anchorID, index);
  }

  // verifyProof verifies a VNodeProof against the anchor's Ed25519 public key.
  public async verifyProof(proof: VNodeProof, anchorPubBase64Url: string): Promise<boolean> {
    return this.deps.crypto.verifyVNodeProof(proof, anchorPubBase64Url);
  }

  public async upsert(input: UpsertVNodeRequest): Promise<void> {
    const vnodeDAO = await this.deps.vnodeDAO();
    await vnodeDAO.upsert(input);
  }

  // validateInlineVnodes verifies an anchor's inline vnodes[] array (anchor
  // registering all its vnodes at once). Invalid entries are skipped; returns
  // the count of accepted vnodes. Enforces the MAX_VNODES_PER_ANCHOR limit.
  public async validateInlineVnodes(
    anchorId: string,
    anchorPubKey: string,
    entries: unknown[],
    nowUnix: number,
  ): Promise<number> {
    const vnodeDAO = await this.deps.vnodeDAO();
    const limited = entries.slice(0, this.deps.config.getMaxVNodesPerAnchor());
    let validCount = 0;
    for (const entry of limited) {
      const ve = entry as InlineVNodeEntry;
      if (typeof ve.vnode_id !== 'string' || !NODE_ID_PATTERN.test(ve.vnode_id) || (typeof ve.index !== 'number')) continue;
      const proof = ve.proof as VNodeProof | undefined;
      if (!proof || !(await this.deps.crypto.verifyVNodeProof(proof, anchorPubKey)) || (await vnodeDAO.checkCollision(ve.vnode_id, anchorId))) continue;
      await vnodeDAO.upsert({
        vnodeId: ve.vnode_id,
        anchorId,
        vnodeIndex: proof.index,
        proofJson: JSON.stringify(proof),
        nowUnix,
      });
      validCount++;
    }
    return validCount;
  }

  // applyBatchedHeartbeats applies per-vnode snapshots piggybacked on an
  // anchor heartbeat (Option B: 1 RPC per interval). Enforces the
  // MAX_VNODES_PER_ANCHOR limit; per-item ownership is enforced by the DAO.
  public async applyBatchedHeartbeats(
    anchorId: string,
    batchRaw: unknown,
    nowUnix: number,
  ): Promise<BatchedHeartbeatResult> {
    if (!Array.isArray(batchRaw)) {
      throw new BadRequestError('vnode_heartbeats must be an array');
    }
    const limit = this.deps.config.getMaxVNodesPerAnchor();
    if (batchRaw.length > limit) {
      throw new BadRequestError(`vnode_heartbeats exceeds limit of ${limit}`);
    }
    const vnodeDAO = await this.deps.vnodeDAO();
    return vnodeDAO.heartbeatBatched(anchorId, batchRaw as VNodeHeartbeatBody[], nowUnix);
  }
}

export { VNodeService };
export type { BatchedHeartbeatResult, InlineVNodeEntry, UpsertVNodeRequest, VNodeServiceDeps };
