import { beforeAll, describe, expect, it } from 'vitest';
import { api, freshNode, postJson, setupIntegration } from '../helpers/setup';

// No caPublicKeyB64Url: exercises the unconfigured-CA branches where the
// service throws InternalServerError('CA public key not configured') and the
// route maps it to 503, and where registration ignores embedded certificates.
beforeAll(async () => {
  await setupIntegration();
});

describe('CRL and certificates without a configured CA', () => {
  it('returns 404 when no CRL has been uploaded', async () => {
    const res = await api('/tracker/crl');
    expect(res.status).toBe(404);
  });

  it('maps a missing CA public key to 503 ServiceUnavailable on upload', async () => {
    const res = await postJson('/tracker/crl', {
      version: 1,
      updated_at: Math.floor(Date.now() / 1000),
      revoked_node_ids: [],
      signature: 'x',
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { Exception: { Type: string } }).Exception.Type).toBe('ServiceUnavailable');
  });

  it('ignores an embedded certificate and still registers the anchor', async () => {
    const { node_id, uri } = freshNode();
    const res = await postJson('/tracker/nodes', {
      node_id,
      uri,
      certificate: {
        version: 1,
        node_id,
        uri,
        public_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        issued_at: 1,
        expires_at: 2,
        signature: 'A'.repeat(86),
      },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { registered: boolean }).registered).toBe(true);
  });
});
