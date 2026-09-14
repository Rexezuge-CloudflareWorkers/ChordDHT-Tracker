import type { NodeDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import { BadRequestError, NotFoundError } from '@chord-dht-tracker/backend-errors';
import type { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import { NODE_ID_PATTERN } from '@chord-dht-tracker/shared';
import type { Certificate, VNodeProof } from '@chord-dht-tracker/shared';
import type { CertService } from '../auth/CertService';
import type { VNodeService } from '../vnode/VNodeService';

interface RegisterNodeInput {
  node_id?: unknown;
  uri?: unknown;
  certificate?: unknown;
  region?: unknown;
  anchor_id?: unknown;
  vnode_proof?: unknown;
  vnodes?: unknown;
}

interface RegisterNodeResult {
  registered: boolean;
  region: string | null;
  known_nodes_count: number;
  message: string;
}

interface NodeRegistrationDeps {
  nodeDAO?: () => Promise<NodeDAO>;
  vnodeDAO?: () => Promise<VNodeDAO>;
  certService?: () => Promise<CertService>;
  vnodeService?: () => Promise<VNodeService>;
  config?: AppConfiguration;
}

// NodeRegistration owns anchor/vnode registration and node deletion.
// Moved verbatim from NodeService; SQL stays in backend-data DAOs and
// crypto in CertService/VNodeService. No direct D1 access here.
class NodeRegistration {
  private readonly deps: Required<NodeRegistrationDeps>;

  constructor(deps: Required<NodeRegistrationDeps>) {
    this.deps = deps;
  }

  public async registerAnchorOrVnode(input: RegisterNodeInput): Promise<RegisterNodeResult> {
    const { node_id, uri } = input;
    if (typeof node_id !== 'string' || !NODE_ID_PATTERN.test(node_id)) {
      throw new BadRequestError('node_id must be a 40-character lowercase hex string');
    }
    if (typeof uri !== 'string' || !uri.startsWith('https://')) {
      throw new BadRequestError('uri must start with https://');
    }
    // eslint-disable-next-line unicorn/prefer-simple-condition-first -- typeof guard must precede length access (short-circuit safety).
    const effectiveRegion = typeof input.region === 'string' && input.region.length > 0 ? input.region : null;

    const certService = await this.deps.certService();
    const caKey = await certService.getCAPublicKey();
    let certJson: string | null = null;
    let certExpiresAt: number | null = null;
    let anchorPubKey: string | null = null;
    if (caKey && input.certificate !== undefined) {
      let verified: Certificate;
      try {
        verified = await certService.verifyCertificate(input.certificate, caKey);
      } catch (error: unknown) {
        throw new BadRequestError(
          `Certificate verification failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (verified.node_id !== node_id) {
        throw new BadRequestError('Certificate node_id does not match request node_id');
      }
      certJson = JSON.stringify(verified);
      certExpiresAt = verified.expires_at;
      anchorPubKey = verified.public_key;
    }

    const anchorId = input.anchor_id;
    const proofRaw = input.vnode_proof;
    const isVNode =
      typeof anchorId === 'string' && NODE_ID_PATTERN.test(anchorId) && proofRaw !== null && typeof proofRaw === 'object';
    const nodeDAO = await this.deps.nodeDAO();
    const vnodeDAO = await this.deps.vnodeDAO();
    const vnodeService = await this.deps.vnodeService();
    if (isVNode) {
      const proof = proofRaw as VNodeProof;
      const anchorCertJson = await nodeDAO.getAnchorCertJson(anchorId);
      const anchorCert = anchorCertJson ? (JSON.parse(anchorCertJson) as Certificate) : null;
      if (!anchorCert) throw new BadRequestError('Anchor node not registered; register anchor first');
      if (!(await vnodeService.verifyProof(proof, anchorCert.public_key))) {
        throw new BadRequestError('VNodeProof signature verification failed');
      }
      if (proof.vnode_id !== node_id) {
        throw new BadRequestError('vnode_id in proof does not match node_id in request');
      }
      // Collision must be checked before the anchor upsert below inserts
      // node_id into `nodes`; otherwise every vnode collides with itself.
      if (await vnodeDAO.checkCollision(node_id, anchorId)) {
        // ID_COLLISION prefix contract: endpoints map this to 409 ConflictError.
        throw new BadRequestError('ID_COLLISION: vnode_id collides with an existing node or vnode');
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const nowUnix = Math.floor(now.getTime() / 1000);
    await nodeDAO.registerAnchor({
      nodeId: node_id,
      uri,
      joinedAtIso: nowIso,
      lastSeenIso: nowIso,
      certJson,
      certExpiresAt,
      region: effectiveRegion,
    });

    if (isVNode) {
      const proof = proofRaw as VNodeProof;
      await vnodeDAO.upsert({
        vnodeId: node_id,
        anchorId: anchorId,
        vnodeIndex: proof.index,
        proofJson: JSON.stringify(proof),
        nowUnix,
      });
    }

    if (!isVNode && anchorPubKey && caKey && Array.isArray(input.vnodes) && input.vnodes.length > 0) {
      const validCount = await vnodeService.validateInlineVnodes(node_id, anchorPubKey, input.vnodes, nowUnix);
      if (validCount > 0) await nodeDAO.setVnodeCount(node_id, validCount);
    }

    await nodeDAO.evictOverLimit(this.deps.config.getMaxNodes());
    return {
      registered: true,
      region: effectiveRegion,
      known_nodes_count: await nodeDAO.countAll(),
      message: 'Node registered successfully',
    };
  }

  public async deleteNode(nodeId: string): Promise<{ deregistered: boolean; node_id: string }> {
    if (!NODE_ID_PATTERN.test(nodeId)) {
      throw new BadRequestError('node_id must be a 40-character lowercase hex string');
    }
    const nodeDAO = await this.deps.nodeDAO();
    const vnodeDAO = await this.deps.vnodeDAO();
    if ((await nodeDAO.deleteAnchor(nodeId)) > 0) {
      await vnodeDAO.deleteByAnchor(nodeId);
      return { deregistered: true, node_id: nodeId };
    }
    const anchorId = await vnodeDAO.findAnchorIdByVnodeId(nodeId);
    if (!anchorId) throw new NotFoundError(`Node ${nodeId} not found`);
    if ((await vnodeDAO.deleteById(nodeId)) === 0) throw new NotFoundError(`Node ${nodeId} not found`);
    await nodeDAO.setVnodeCount(anchorId, await vnodeDAO.countByAnchor(anchorId));
    return { deregistered: true, node_id: nodeId };
  }
}

export { NodeRegistration };
export type { NodeRegistrationDeps, RegisterNodeInput, RegisterNodeResult };
