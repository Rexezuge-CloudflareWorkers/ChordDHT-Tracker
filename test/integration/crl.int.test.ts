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
} from './helpers/setup';

let caPrivateKey: CryptoKey;

beforeAll(async () => {
  const ca = await generateEd25519Keypair();
  caPrivateKey = ca.privateKey;
  await setupIntegration({ caPublicKeyB64Url: await exportPublicKeyB64Url(ca.publicKey) });
});

describe('CRL endpoints', () => {
  it('returns 404 when no CRL has been uploaded', async () => {
    const res = await api('/tracker/crl');
    expect(res.status).toBe(404);
    expect(((await res.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('NotFound');
  });

  it('rejects a malformed CRL body', async () => {
    const res = await postJson('/tracker/crl', { version: 'one' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('BadRequest');
  });

  it('rejects a CRL with a bad CA signature', async () => {
    const { node_id } = freshNode();
    const res = await postJson('/tracker/crl', {
      version: 1,
      updated_at: Math.floor(Date.now() / 1000),
      revoked_node_ids: [node_id],
      signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('BadRequest');
  });

  it('stores a CA-signed CRL and serves it back', async () => {
    const { node_id } = freshNode();
    const crl = await makeCRL({
      caPrivateKey,
      version: 1,
      updatedAt: Math.floor(Date.now() / 1000),
      revokedIds: [node_id],
    });
    const uploaded = await postJson('/tracker/crl', crl);
    expect(uploaded.status).toBe(200);
    expect(await uploaded.json()).toEqual({ updated: true, version: 1, revoked_count: 1 });

    const fetched = await api('/tracker/crl');
    expect(fetched.status).toBe(200);
    const stored = (await fetched.json()) as { version: number; revoked_node_ids: string[] };
    expect(stored.version).toBe(1);
    expect(stored.revoked_node_ids).toEqual([node_id]);
  });

  it('rejects a stale CRL version', async () => {
    const replay = await makeCRL({
      caPrivateKey,
      version: 1,
      updatedAt: Math.floor(Date.now() / 1000),
      revokedIds: [],
    });
    const res = await postJson('/tracker/crl', replay);
    expect(res.status).toBe(409);
  });

  it('accepts a newer CRL version', async () => {
    const next = await makeCRL({
      caPrivateKey,
      version: 2,
      updatedAt: Math.floor(Date.now() / 1000),
      revokedIds: [],
    });
    const res = await postJson('/tracker/crl', next);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { version: number }).version).toBe(2);
  });

  it('registers a node with a CA-signed cert and exposes it via seeds', async () => {
    const nodeKeys = await generateEd25519Keypair();
    const { uri } = freshNode();
    const node_id = await uriNodeId(uri);
    const now = Math.floor(Date.now() / 1000);
    const certificate = await makeCertificate({
      caPrivateKey,
      node_id,
      uri,
      publicKeyB64Url: await exportPublicKeyB64Url(nodeKeys.publicKey),
      issuedAt: now - 60,
      expiresAt: now + 3600,
    });
    const registered = await registerNode(node_id, uri, { certificate });
    expect(registered.registered).toBe(true);

    const seeds = (await (await api(`/tracker/nodes/seeds?include_cert=true&exclude=${'0'.repeat(40)}`)).json()) as {
      seeds: { node_id: string; certificate?: { node_id: string } }[];
    };
    const seed = seeds.seeds.find((entry) => entry.node_id === node_id);
    expect(seed?.certificate?.node_id).toBe(node_id);
  });
});
