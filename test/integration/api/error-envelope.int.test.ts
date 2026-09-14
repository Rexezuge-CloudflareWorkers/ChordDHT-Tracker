import { beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN_SECRET_VALUE,
  api,
  exportPublicKeyB64Url,
  freshNode,
  generateEd25519Keypair,
  makeCRL,
  postJson,
  registerNode,
  setupIntegration,
} from '../helpers/setup';

let caPrivateKey: CryptoKey;

beforeAll(async () => {
  const ca = await generateEd25519Keypair();
  caPrivateKey = ca.privateKey;
  await setupIntegration({ caPublicKeyB64Url: await exportPublicKeyB64Url(ca.publicKey) });
});

interface ExceptionBody {
  Exception: { Type: string; Message: string };
}

async function expectEnvelope(res: Response, status: number, type: string): Promise<void> {
  expect(res.status).toBe(status);
  const body = (await res.json()) as ExceptionBody;
  expect(body.Exception.Type).toBe(type);
  expect(typeof body.Exception.Message).toBe('string');
}

describe('error envelope contract', () => {
  it('maps BadRequest for malformed registration and CRL bodies', async () => {
    await expectEnvelope(await postJson('/tracker/nodes', { node_id: 'xyz', uri: 'https://x.example' }), 400, 'BadRequest');
    await expectEnvelope(await postJson('/tracker/crl', { version: 'one' }), 400, 'BadRequest');
  });

  it('maps NotFound for unknown nodes, heartbeats, and missing regions', async () => {
    const { node_id } = freshNode();
    await expectEnvelope(await api(`/tracker/nodes/${node_id}`), 404, 'NotFound');
    await expectEnvelope(await api(`/tracker/nodes/${node_id}`, { method: 'DELETE' }), 404, 'NotFound');
    await expectEnvelope(await postJson(`/tracker/nodes/${node_id}/heartbeat`, {}), 404, 'NotFound');
  });

  it('maps Unauthorized for admin-gated routes without a valid token', async () => {
    await expectEnvelope(await api('/tracker/admin/verify'), 401, 'Unauthorized');
    await expectEnvelope(await api('/tracker/admin/verify', { headers: { Authorization: 'Bearer wrong' } }), 401, 'Unauthorized');
  });

  it('accepts the configured admin secret on the verify route', async () => {
    const res = await api('/tracker/admin/verify', {
      headers: { Authorization: `Bearer ${ADMIN_SECRET_VALUE}` },
    });
    expect(res.status).toBe(200);
  });

  it('maps Conflict for a stale CRL version', async () => {
    const { node_id } = freshNode();
    const now = Math.floor(Date.now() / 1000);
    const first = await postJson(
      '/tracker/crl',
      await makeCRL({ caPrivateKey, version: 1, updatedAt: now, revokedIds: [node_id] }),
    );
    expect(first.status).toBe(200);
    await expectEnvelope(
      await postJson('/tracker/crl', await makeCRL({ caPrivateKey, version: 1, updatedAt: now, revokedIds: [] })),
      409,
      'Conflict',
    );
  });

  it('keeps anchor re-registration idempotent (200, not Conflict)', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri);
    const again = await postJson('/tracker/nodes', { node_id, uri });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { registered: boolean }).registered).toBe(true);
  });
});
