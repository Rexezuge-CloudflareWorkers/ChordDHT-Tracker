import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { errorResponse } from '@/errors';
import { getMaxNodes, evictOverLimit, getCAPublicKey } from '@/db';
import { verifyCertificate } from '@/auth';
import type { Certificate } from '@/types';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodesPostRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    let body: { node_id?: unknown; uri?: unknown; certificate?: unknown; region?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid JSON body', 400);
    }

    const { node_id, uri, certificate, region } = body;
    const regionValue = typeof region === 'string' && region.length > 0 ? region : null;
    if (typeof node_id !== 'string' || !NODE_ID_REGEX.test(node_id)) {
      return errorResponse('INVALID_REQUEST', 'node_id must be a 40-character lowercase hex string', 400);
    }
    if (typeof uri !== 'string' || !uri.startsWith('https://')) {
      return errorResponse('INVALID_REQUEST', 'uri must start with https://', 400);
    }

    // Certificate verification (when CA public key is configured)
    let certJson: string | null = null;
    let certExpiresAt: number | null = null;
    if (certificate !== undefined) {
      const caKey = await getCAPublicKey(c.env);
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
      }
    }

    const { success } = await c.env.NODE_RATE_LIMITER.limit({ key: node_id });
    if (!success) {
      return errorResponse('RATE_LIMITED', 'Rate limit exceeded for this node', 429);
    }

    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO nodes (node_id, uri, joined_at, last_seen, cert_json, cert_expires_at, region)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(node_id) DO UPDATE SET
         uri = excluded.uri,
         last_seen = excluded.last_seen,
         cert_json = COALESCE(excluded.cert_json, cert_json),
         cert_expires_at = COALESCE(excluded.cert_expires_at, cert_expires_at),
         region = COALESCE(excluded.region, region)`,
    )
      .bind(node_id, uri, now, now, certJson, certExpiresAt, regionValue)
      .run();

    await evictOverLimit(c.env.DB, getMaxNodes(c.env));

    const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM nodes').first<{ count: number }>();

    return c.json({
      registered: true,
      known_nodes_count: countResult?.count ?? 0,
      message: 'Node registered successfully',
    });
  }
}

export { NodesPostRoute };
