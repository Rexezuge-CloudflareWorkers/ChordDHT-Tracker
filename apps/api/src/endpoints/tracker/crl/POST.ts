import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { RouteContext } from '@/endpoints/IBaseRoute';
import { errorResponse } from '@/errors';
import { getCAPublicKey } from '@/db';
import { verifyCRL } from '@/auth';

class CRLPostRoute extends IBaseRoute {
  protected async handleRequest(c: RouteContext): Promise<Response> {
    const caKey = await getCAPublicKey(c.env);
    if (!caKey) {
      return errorResponse('NOT_CONFIGURED', 'CA public key not configured', 503);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid JSON body', 400);
    }

    const crl = body as { version?: unknown; updated_at?: unknown; revoked_node_ids?: unknown; signature?: unknown };
    if (
      typeof crl.version !== 'number' ||
      typeof crl.updated_at !== 'number' ||
      !Array.isArray(crl.revoked_node_ids) ||
      typeof crl.signature !== 'string'
    ) {
      return errorResponse('INVALID_REQUEST', 'CRL must have version, updated_at, revoked_node_ids, and signature fields', 400);
    }

    const typedCRL = {
      version: crl.version,
      updated_at: crl.updated_at,
      revoked_node_ids: crl.revoked_node_ids as string[],
      signature: crl.signature,
    };

    const valid = await verifyCRL(typedCRL, caKey);
    if (!valid) {
      return errorResponse('INVALID_CERTIFICATE', 'CRL signature verification failed', 400);
    }

    // Check that the new CRL version is greater than the current stored version.
    const existing = await c.env.DB.prepare('SELECT version FROM crl ORDER BY id DESC LIMIT 1').first<{
      version: number;
    }>();
    if (existing && typedCRL.version <= existing.version) {
      return errorResponse('INVALID_REQUEST', `CRL version must be greater than current version (${existing.version})`, 409);
    }

    const crlJson = JSON.stringify(typedCRL);
    await c.env.DB.prepare('INSERT INTO crl (version, updated_at, crl_json) VALUES (?, ?, ?)')
      .bind(typedCRL.version, typedCRL.updated_at, crlJson)
      .run();

    return c.json({ updated: true, version: typedCRL.version, revoked_count: typedCRL.revoked_node_ids.length });
  }
}

export { CRLPostRoute };
