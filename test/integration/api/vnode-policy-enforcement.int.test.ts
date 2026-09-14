import { beforeAll, describe, expect, it } from 'vitest';
import {
  adminHeaders,
  api,
  deriveVNodeID,
  exportPublicKeyB64Std,
  exportPublicKeyB64Url,
  freshNode,
  generateEd25519Keypair,
  makeCertificate,
  makeVNodeProof,
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

interface CertAnchor {
  anchorId: string;
  uri: string;
  anchorKeys: CryptoKeyPair;
  anchorPubB64Std: string;
  certificate: Record<string, unknown>;
}

async function buildCertAnchor(): Promise<CertAnchor> {
  const anchorKeys = await generateEd25519Keypair();
  const anchorPubB64Url = await exportPublicKeyB64Url(anchorKeys.publicKey);
  const anchorPubB64Std = await exportPublicKeyB64Std(anchorKeys.publicKey);
  const { uri } = freshNode();
  const anchorId = await uriNodeId(uri);
  const now = Math.floor(Date.now() / 1000);
  const certificate = (await makeCertificate({
    caPrivateKey,
    node_id: anchorId,
    uri,
    publicKeyB64Url: anchorPubB64Url,
    issuedAt: now - 60,
    expiresAt: now + 3600,
  })) as unknown as Record<string, unknown>;
  return { anchorId, uri, anchorKeys, anchorPubB64Std, certificate };
}

async function makeProof(anchor: CertAnchor, vnodeId: string, index: number): Promise<Record<string, unknown>> {
  const now = Math.floor(Date.now() / 1000);
  return (await makeVNodeProof({
    anchorPrivateKey: anchor.anchorKeys.privateKey,
    anchorPublicKeyB64Std: anchor.anchorPubB64Std,
    vnode_id: vnodeId,
    anchor_id: anchor.anchorId,
    index,
    issuedAt: now - 60,
    expiresAt: now + 3600,
  })) as unknown as Record<string, unknown>;
}

describe('vnode policy enforcement', () => {
  it('caps inline vnodes at MAX_VNODES_PER_ANCHOR (8 of 9 accepted)', async () => {
    const anchor = await buildCertAnchor();
    const entries = [];
    for (let index = 0; index < 9; index += 1) {
      const vnodeId = await deriveVNodeID(anchor.anchorId, index);
      entries.push({ vnode_id: vnodeId, index, proof: await makeProof(anchor, vnodeId, index) });
    }
    const body = await registerNode(anchor.anchorId, anchor.uri, {
      certificate: anchor.certificate,
      vnodes: entries,
    });
    expect(body.registered).toBe(true);

    const record = (await (
      await api(`/tracker/nodes/${anchor.anchorId}`, { headers: adminHeaders() })
    ).json()) as { vnode_count: number };
    expect(record.vnode_count).toBe(8);
  });

  it('registers a standalone vnode via anchor_id + vnode_proof', async () => {
    const anchor = await buildCertAnchor();
    await registerNode(anchor.anchorId, anchor.uri, { certificate: anchor.certificate });

    const vnodeId = await deriveVNodeID(anchor.anchorId, 0);
    const { uri: vnodeUri } = freshNode();
    const res = await postJson('/tracker/nodes', {
      node_id: vnodeId,
      uri: vnodeUri,
      anchor_id: anchor.anchorId,
      vnode_proof: await makeProof(anchor, vnodeId, 0),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { registered: boolean }).registered).toBe(true);

    const record = (await (
      await api(`/tracker/nodes/${vnodeId}`, { headers: adminHeaders() })
    ).json()) as { node_id: string; uri: string };
    expect(record.node_id).toBe(vnodeId);
    expect(record.uri).toBe(vnodeUri);
  });

  it('rejects a standalone vnode proof signed by the wrong key', async () => {
    const anchor = await buildCertAnchor();
    await registerNode(anchor.anchorId, anchor.uri, { certificate: anchor.certificate });

    const stranger = await generateEd25519Keypair();
    const strangerPubStd = await exportPublicKeyB64Std(stranger.publicKey);
    const vnodeId = await deriveVNodeID(anchor.anchorId, 1);
    const { uri: vnodeUri } = freshNode();
    const now = Math.floor(Date.now() / 1000);
    const badProof = await makeVNodeProof({
      anchorPrivateKey: stranger.privateKey,
      anchorPublicKeyB64Std: strangerPubStd,
      vnode_id: vnodeId,
      anchor_id: anchor.anchorId,
      index: 1,
      issuedAt: now - 60,
      expiresAt: now + 3600,
    });
    const res = await postJson('/tracker/nodes', {
      node_id: vnodeId,
      uri: vnodeUri,
      anchor_id: anchor.anchorId,
      vnode_proof: badProof,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string } }).Exception.Type).toBe('BadRequest');
  });

  it('deletes a vnode and reports 404 on subsequent reads', async () => {
    const anchor = await buildCertAnchor();
    await registerNode(anchor.anchorId, anchor.uri, { certificate: anchor.certificate });

    const vnodeId = await deriveVNodeID(anchor.anchorId, 2);
    const { uri: vnodeUri } = freshNode();
    const created = await postJson('/tracker/nodes', {
      node_id: vnodeId,
      uri: vnodeUri,
      anchor_id: anchor.anchorId,
      vnode_proof: await makeProof(anchor, vnodeId, 2),
    });
    expect(created.status).toBe(200);

    const deleted = await api(`/tracker/nodes/${vnodeId}`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    expect((await api(`/tracker/nodes/${vnodeId}`)).status).toBe(404);
  });
});
