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
let strangerPrivateKey: CryptoKey;

beforeAll(async () => {
  const ca = await generateEd25519Keypair();
  caPrivateKey = ca.privateKey;
  strangerPrivateKey = (await generateEd25519Keypair()).privateKey;
  await setupIntegration({ caPublicKeyB64Url: await exportPublicKeyB64Url(ca.publicKey) });
});

interface CertAnchor {
  anchorId: string;
  uri: string;
  anchorKeys: CryptoKeyPair;
  anchorPubB64Url: string;
  anchorPubB64Std: string;
}

async function buildAnchor(): Promise<CertAnchor> {
  const anchorKeys = await generateEd25519Keypair();
  const anchorPubB64Url = await exportPublicKeyB64Url(anchorKeys.publicKey);
  const anchorPubB64Std = await exportPublicKeyB64Std(anchorKeys.publicKey);
  const { uri } = freshNode();
  const anchorId = await uriNodeId(uri);
  return { anchorId, uri, anchorKeys, anchorPubB64Url, anchorPubB64Std };
}

async function validCert(anchor: CertAnchor, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const now = Math.floor(Date.now() / 1000);
  return (await makeCertificate({
    caPrivateKey,
    node_id: anchor.anchorId,
    uri: anchor.uri,
    publicKeyB64Url: anchor.anchorPubB64Url,
    issuedAt: now - 60,
    expiresAt: now + 3600,
    ...overrides,
  })) as unknown as Record<string, unknown>;
}

describe('POST /tracker/nodes certificate validation', () => {
  it('rejects a certificate whose node_id does not match the request', async () => {
    const anchor = await buildAnchor();
    const other = freshNode();
    const res = await postJson('/tracker/nodes', {
      node_id: other.node_id,
      uri: other.uri,
      certificate: await validCert(anchor),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string } }).Exception.Type).toBe('BadRequest');
  });

  it('rejects expired, not-yet-valid, and wrong-signer certificates', async () => {
    const now = Math.floor(Date.now() / 1000);
    const cases: { name: string; cert: Record<string, unknown> }[] = [];
    {
      const anchor = await buildAnchor();
      cases.push({
        name: 'expired',
        cert: await validCert(anchor, { issuedAt: now - 7200, expiresAt: now - 3600 }),
      });
    }
    {
      const anchor = await buildAnchor();
      cases.push({
        name: 'not-yet-valid',
        cert: await validCert(anchor, { issuedAt: now + 3600, expiresAt: now + 7200 }),
      });
    }
    {
      const anchor = await buildAnchor();
      cases.push({
        name: 'wrong-signer',
        cert: (await makeCertificate({
          caPrivateKey: strangerPrivateKey,
          node_id: anchor.anchorId,
          uri: anchor.uri,
          publicKeyB64Url: anchor.anchorPubB64Url,
          issuedAt: now - 60,
          expiresAt: now + 3600,
        })) as unknown as Record<string, unknown>,
      });
    }
    for (const { name, cert } of cases) {
      const res = await postJson('/tracker/nodes', {
        node_id: cert.node_id,
        uri: cert.uri,
        certificate: cert,
      });
      expect(res.status, name).toBe(400);
      expect(((await res.json()) as { Exception: { Type: string } }).Exception.Type).toBe('BadRequest');
    }
  });

  it('rejects a certificate whose node_id does not match sha1(uri)', async () => {
    const anchor = await buildAnchor();
    const otherUri = freshNode().uri;
    const now = Math.floor(Date.now() / 1000);
    const cert = (await makeCertificate({
      caPrivateKey,
      node_id: anchor.anchorId,
      uri: otherUri,
      publicKeyB64Url: anchor.anchorPubB64Url,
      issuedAt: now - 60,
      expiresAt: now + 3600,
    })) as unknown as Record<string, unknown>;
    const res = await postJson('/tracker/nodes', { node_id: anchor.anchorId, uri: anchor.uri, certificate: cert });
    expect(res.status).toBe(400);
  });

  it('rejects uris with path, query, fragment, or userinfo', async () => {
    for (const uri of [
      'https://x.example/path',
      'https://x.example/?q=1',
      'https://x.example/#f',
      'https://user@x.example/',
    ]) {
      const { node_id } = freshNode();
      const res = await postJson('/tracker/nodes', { node_id, uri });
      expect(res.status, uri).toBe(400);
      expect(((await res.json()) as { Exception: { Type: string } }).Exception.Type).toBe('BadRequest');
    }
  });

  it('treats an empty region as null and anchor_id without proof as an anchor', async () => {
    const { node_id, uri } = freshNode();
    expect((await registerNode(node_id, uri, { region: '' })).region).toBeNull();

    const anchor = freshNode();
    await registerNode(anchor.node_id, anchor.uri);
    const { node_id: plainId, uri: plainUri } = freshNode();
    const res = await postJson('/tracker/nodes', { node_id: plainId, uri: plainUri, anchor_id: anchor.node_id });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { registered: boolean }).registered).toBe(true);
  });

  it('rejects a standalone vnode whose proof vnode_id mismatches or is expired', async () => {
    const anchor = await buildAnchor();
    await registerNode(anchor.anchorId, anchor.uri, { certificate: await validCert(anchor) });
    const now = Math.floor(Date.now() / 1000);

    const vnodeId = await deriveVNodeID(anchor.anchorId, 0);
    const otherId = await deriveVNodeID(anchor.anchorId, 1);
    const { uri: vnodeUri } = freshNode();
    const mismatch = await postJson('/tracker/nodes', {
      node_id: otherId,
      uri: vnodeUri,
      anchor_id: anchor.anchorId,
      vnode_proof: await makeVNodeProof({
        anchorPrivateKey: anchor.anchorKeys.privateKey,
        anchorPublicKeyB64Std: anchor.anchorPubB64Std,
        vnode_id: vnodeId,
        anchor_id: anchor.anchorId,
        index: 0,
        issuedAt: now - 60,
        expiresAt: now + 3600,
      }),
    });
    expect(mismatch.status).toBe(400);

    const expiredId = await deriveVNodeID(anchor.anchorId, 2);
    const { uri: expiredUri } = freshNode();
    const expired = await postJson('/tracker/nodes', {
      node_id: expiredId,
      uri: expiredUri,
      anchor_id: anchor.anchorId,
      vnode_proof: await makeVNodeProof({
        anchorPrivateKey: anchor.anchorKeys.privateKey,
        anchorPublicKeyB64Std: anchor.anchorPubB64Std,
        vnode_id: expiredId,
        anchor_id: anchor.anchorId,
        index: 2,
        issuedAt: now - 7200,
        expiresAt: now - 3600,
      }),
    });
    expect(expired.status).toBe(400);
  });

  it('skips inline entries with bad signatures or missing proofs', async () => {
    const anchor = await buildAnchor();
    const now = Math.floor(Date.now() / 1000);
    const goodId = await deriveVNodeID(anchor.anchorId, 0);
    const badId = await deriveVNodeID(anchor.anchorId, 1);
    const stranger = await generateEd25519Keypair();
    const body = await registerNode(anchor.anchorId, anchor.uri, {
      certificate: await validCert(anchor),
      vnodes: [
        {
          vnode_id: goodId,
          index: 0,
          proof: await makeVNodeProof({
            anchorPrivateKey: anchor.anchorKeys.privateKey,
            anchorPublicKeyB64Std: anchor.anchorPubB64Std,
            vnode_id: goodId,
            anchor_id: anchor.anchorId,
            index: 0,
            issuedAt: now - 60,
            expiresAt: now + 3600,
          }),
        },
        {
          vnode_id: badId,
          index: 1,
          proof: await makeVNodeProof({
            anchorPrivateKey: stranger.privateKey,
            anchorPublicKeyB64Std: await exportPublicKeyB64Std(stranger.publicKey),
            vnode_id: badId,
            anchor_id: anchor.anchorId,
            index: 1,
            issuedAt: now - 60,
            expiresAt: now + 3600,
          }),
        },
        { vnode_id: await deriveVNodeID(anchor.anchorId, 2), index: 2 },
      ],
    });
    expect(body.registered).toBe(true);

    const record = (await (
      await api(`/tracker/nodes/${anchor.anchorId}`, { headers: adminHeaders() })
    ).json()) as { vnode_count: number };
    expect(record.vnode_count).toBe(1);
  });

  it('rate-limits before certificate verification (bad cert still 429)', async () => {
    // The bad cert must pass route-schema validation (which runs before the
    // route handler): only service-level verification failures surface 429.
    const { node_id, uri } = freshNode();
    for (let i = 0; i < 10; i += 1) {
      expect((await postJson('/tracker/nodes', { node_id, uri })).status).toBe(200);
    }
    const now = Math.floor(Date.now() / 1000);
    const nodeKeys = await generateEd25519Keypair();
    const badCert = (await makeCertificate({
      caPrivateKey: strangerPrivateKey,
      node_id,
      uri,
      publicKeyB64Url: await exportPublicKeyB64Url(nodeKeys.publicKey),
      issuedAt: now - 60,
      expiresAt: now + 3600,
    })) as unknown as Record<string, unknown>;
    const res = await postJson('/tracker/nodes', { node_id, uri, certificate: badCert });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { Exception: { Type: string } }).Exception.Type).toBe('RateLimited');
  });
});
