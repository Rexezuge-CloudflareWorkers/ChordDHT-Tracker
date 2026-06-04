import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { errorResponse } from '@/errors';
import { getMaxNodes, evictOverLimit, getCAPublicKey, upsertVNode, checkVNodeIDCollision, updateAnchorVnodeCount, verifyVNodeProof } from '@/db';
import { verifyCertificate } from '@/auth';
import type { Certificate, VNodeProof } from '@/types';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;
const MAX_VNODES_PER_ANCHOR = 8;

class NodesPostRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    let body: { node_id?: unknown; uri?: unknown; certificate?: unknown; region?: unknown; vnodes?: unknown; anchor_id?: unknown; vnode_proof?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid JSON body', 400);
    }

    const { node_id, uri, certificate, region, vnodes, anchor_id, vnode_proof } = body;
    const effectiveRegion = (typeof region === 'string' && region.length > 0) ? region : null;
    if (typeof node_id !== 'string' || !NODE_ID_REGEX.test(node_id)) {
      return errorResponse('INVALID_REQUEST', 'node_id must be a 40-character lowercase hex string', 400);
    }
    if (typeof uri !== 'string' || !uri.startsWith('https://')) {
      return errorResponse('INVALID_REQUEST', 'uri must start with https://', 400);
    }

    // Certificate verification (when CA public key is configured)
    let certJson: string | null = null;
    let certExpiresAt: number | null = null;
    let anchorPubKeyBase64url: string | null = null;
    const caKey = await getCAPublicKey(c.env);
    if (certificate !== undefined) {
      if (caKey) {
        let verified: Certificate;
        try {
          verified = await verifyCertificate(certificate, caKey);
        } catch (e: unknown) {
          return errorResponse('INVALID_CERTIFICATE', `Certificate verification failed: ${e instanceof Error ? e.message : String(e)}`, 400);
        }
        if (verified.node_id !== node_id) {
          return errorResponse('INVALID_CERTIFICATE', 'Certificate node_id does not match request node_id', 400);
        }
        certJson = JSON.stringify(verified);
        certExpiresAt = verified.expires_at;
        anchorPubKeyBase64url = verified.public_key;
      }
    }

    // v4.0: if this is a vnode registration (anchor_id + vnode_proof present), verify the proof.
    const isVNode = typeof anchor_id === 'string' && NODE_ID_REGEX.test(anchor_id) && vnode_proof !== null && typeof vnode_proof === 'object';
    const db = c.env.DB.withSession('first-primary');
    if (isVNode) {
      const proof = vnode_proof as VNodeProof;
      // Find anchor's public key from its registered certificate.
      const anchorCertRow = await db.prepare('SELECT cert_json FROM nodes WHERE node_id = ?')
        .bind(anchor_id).first<{ cert_json: string | null }>();
      const anchorCert = anchorCertRow?.cert_json ? JSON.parse(anchorCertRow.cert_json) as Certificate : null;
      if (!anchorCert) {
        return errorResponse('INVALID_VNODE_PROOF', 'Anchor node not registered; register anchor first', 400);
      }
      const proofOk = await verifyVNodeProof(proof, anchorCert.public_key);
      if (!proofOk) {
        return errorResponse('INVALID_VNODE_PROOF', 'VNodeProof signature verification failed', 400);
      }
      if (proof.vnode_id !== node_id) {
        return errorResponse('INVALID_VNODE_PROOF', 'vnode_id in proof does not match node_id in request', 400);
      }
    }

    const { success } = await c.env.NODE_RATE_LIMITER.limit({ key: node_id });
    if (!success) {
      return errorResponse('RATE_LIMITED', 'Rate limit exceeded for this node', 429);
    }

    const now = new Date().toISOString();
    const nowUnix = Math.floor(Date.now() / 1000);
    await db.prepare(
      `INSERT INTO nodes (node_id, uri, joined_at, last_seen, cert_json, cert_expires_at, region)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(node_id) DO UPDATE SET
         uri = excluded.uri,
         last_seen = excluded.last_seen,
         cert_json = COALESCE(excluded.cert_json, cert_json),
         cert_expires_at = COALESCE(excluded.cert_expires_at, cert_expires_at),
         region = COALESCE(excluded.region, region)`,
    )
      .bind(node_id, uri, now, now, certJson, certExpiresAt, effectiveRegion)
      .run();

    // v4.0: store vnode record if this is a vnode registration.
    if (isVNode) {
      const proof = vnode_proof as VNodeProof;
      const collision = await checkVNodeIDCollision(db, node_id, anchor_id as string);
      if (collision) {
        return errorResponse('ID_COLLISION', 'vnode_id collides with an existing node or vnode', 409);
      }
      await upsertVNode(db, {
        vnode_id: node_id,
        anchor_id: anchor_id as string,
        vnode_index: proof.index,
        proof_json: JSON.stringify(vnode_proof),
        now: nowUnix,
      });
    }

    // v4.0: process inline vnodes array (anchor registering all its vnodes at once).
    if (Array.isArray(vnodes) && vnodes.length > 0 && !isVNode) {
      const anchorNode = node_id;
      const anchorCertPubKey = anchorPubKeyBase64url;
      let validCount = 0;
      if (anchorCertPubKey && caKey) {
        const limited = vnodes.slice(0, MAX_VNODES_PER_ANCHOR);
        for (const entry of limited) {
          const ve = entry as { vnode_id?: unknown; index?: unknown; proof?: unknown };
          if (typeof ve.vnode_id !== 'string' || !NODE_ID_REGEX.test(ve.vnode_id)) continue;
          if (typeof ve.index !== 'number') continue;
          const proof = ve.proof as VNodeProof | undefined;
          if (!proof) continue;
          const proofOk = await verifyVNodeProof(proof, anchorCertPubKey);
          if (!proofOk) continue;
          const collision = await checkVNodeIDCollision(db, ve.vnode_id, anchorNode);
          if (collision) continue;
          await upsertVNode(db, {
            vnode_id: ve.vnode_id,
            anchor_id: anchorNode,
            vnode_index: proof.index,
            proof_json: JSON.stringify(proof),
            now: nowUnix,
          });
          validCount++;
        }
        if (validCount > 0) {
          await updateAnchorVnodeCount(db, anchorNode, validCount);
        }
      }
    }

    await evictOverLimit(db, getMaxNodes(c.env));

    const countResult = await db.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();

    return c.json({
      registered: true,
      region: effectiveRegion ?? null,
      known_nodes_count: countResult?.count ?? 0,
      message: 'Node registered successfully',
    });
  }
}

export { NodesPostRoute };
