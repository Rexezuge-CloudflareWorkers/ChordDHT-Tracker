import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  exportPublicKeyB64Url,
  freshNode,
  generateEd25519Keypair,
  makeCertificate,
  makeCRL,
  postJson,
  registerNode,
  setupIntegration,
  uriNodeId,
} from '../helpers/setup';

let caPrivateKey: CryptoKey;

beforeAll(async () => {
  const ca = await generateEd25519Keypair();
  caPrivateKey = ca.privateKey;
  await setupIntegration({ caPublicKeyB64Url: await exportPublicKeyB64Url(ca.publicKey) });
});

describe('CRL revocation lifecycle', () => {
  it('stores revoked ids that a later CRL version can supersede', async () => {
    const { node_id: revoked } = freshNode();
    const now = Math.floor(Date.now() / 1000);
    const uploaded = await postJson(
      '/tracker/crl',
      await makeCRL({ caPrivateKey, version: 1, updatedAt: now, revokedIds: [revoked] }),
    );
    expect(uploaded.status).toBe(200);

    const fetched = (await (await api('/tracker/crl')).json()) as { revoked_node_ids: string[] };
    expect(fetched.revoked_node_ids).toEqual([revoked]);

    const cleared = await postJson(
      '/tracker/crl',
      await makeCRL({ caPrivateKey, version: 2, updatedAt: now + 1, revokedIds: [] }),
    );
    expect(cleared.status).toBe(200);
    const after = (await (await api('/tracker/crl')).json()) as { revoked_node_ids: string[] };
    expect(after.revoked_node_ids).toEqual([]);
  });

  it('documents the revocation-enforcement gap: a revoked node can still register', async () => {
    // TODO: enforce CRL revocation at registration and heartbeat. The tracker
    // stores and serves CRLs but never checks membership on the write path,
    // so this test locks the current (permissive) behavior. When enforcement
    // lands, flip these assertions to expect rejection.
    const { uri } = freshNode();
    const nodeId = await uriNodeId(uri);
    const now = Math.floor(Date.now() / 1000);
    const anchorKeys = await generateEd25519Keypair();
    const certificate = await makeCertificate({
      caPrivateKey,
      node_id: nodeId,
      uri,
      publicKeyB64Url: await exportPublicKeyB64Url(anchorKeys.publicKey),
      issuedAt: now - 60,
      expiresAt: now + 3600,
    });
    await postJson(
      '/tracker/crl',
      await makeCRL({ caPrivateKey, version: 3, updatedAt: now + 2, revokedIds: [nodeId] }),
    );
    const body = await registerNode(nodeId, uri, { certificate });
    expect(body.registered).toBe(true);
  });
});
