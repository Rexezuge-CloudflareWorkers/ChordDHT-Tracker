import { beforeAll, describe, expect, it } from 'vitest';
import {
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
} from './helpers/setup';

let caPrivateKey: CryptoKey;

beforeAll(async () => {
  const ca = await generateEd25519Keypair();
  caPrivateKey = ca.privateKey;
  await setupIntegration({ caPublicKeyB64Url: await exportPublicKeyB64Url(ca.publicKey) });
});

describe('POST /tracker/nodes', () => {
  it('registers an anchor and reports the ring size', async () => {
    const { node_id, uri } = freshNode();
    const body = await registerNode(node_id, uri);
    expect(body.registered).toBe(true);
    expect(body.region).toBeNull();
    expect(typeof body.known_nodes_count).toBe('number');
    expect(body.known_nodes_count).toBeGreaterThanOrEqual(1);
    expect(typeof body.message).toBe('string');
  });

  it('re-registers the same node idempotently', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri);
    const body = await registerNode(node_id, uri);
    expect(body.registered).toBe(true);
  });

  it('echoes the region when provided', async () => {
    const { node_id, uri } = freshNode();
    const body = await registerNode(node_id, uri, { region: 'eu-west' });
    expect(body.region).toBe('eu-west');
  });

  it('registers an anchor with a CA-signed certificate and inline vnodes', async () => {
    const anchorKeys = await generateEd25519Keypair();
    const anchorPubB64Url = await exportPublicKeyB64Url(anchorKeys.publicKey);
    const anchorPubB64Std = await exportPublicKeyB64Std(anchorKeys.publicKey);
    const { uri } = freshNode();
    const anchorId = await uriNodeId(uri);
    const now = Math.floor(Date.now() / 1000);
    const certificate = await makeCertificate({
      caPrivateKey,
      node_id: anchorId,
      uri,
      publicKeyB64Url: anchorPubB64Url,
      issuedAt: now - 60,
      expiresAt: now + 3600,
    });
    const vnodeIds = [await deriveVNodeID(anchorId, 0), await deriveVNodeID(anchorId, 1)];
    const vnodes = [];
    for (let index = 0; index < vnodeIds.length; index += 1) {
      vnodes.push({
        vnode_id: vnodeIds[index],
        index,
        proof: await makeVNodeProof({
          anchorPrivateKey: anchorKeys.privateKey,
          anchorPublicKeyB64Std: anchorPubB64Std,
          vnode_id: vnodeIds[index]!,
          anchor_id: anchorId,
          index,
          issuedAt: now - 60,
          expiresAt: now + 3600,
        }),
      });
    }
    // Invalid entries are skipped, not fatal.
    vnodes.push({ vnode_id: 'not-hex', index: 99 });
    const body = await registerNode(anchorId, uri, { certificate, vnodes });
    expect(body.registered).toBe(true);
    expect(body.known_nodes_count).toBeGreaterThanOrEqual(1);
  });

  it('rejects a non-hex node_id', async () => {
    const res = await postJson('/tracker/nodes', { node_id: 'tooshort', uri: 'https://x.example' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('BadRequest');
  });

  it('rejects an uppercase node_id', async () => {
    const res = await postJson('/tracker/nodes', { node_id: 'A'.repeat(40), uri: 'https://x.example' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-https uri', async () => {
    const { node_id } = freshNode();
    const res = await postJson('/tracker/nodes', { node_id, uri: 'http://x.example' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('BadRequest');
  });

  it('rejects malformed JSON', async () => {
    const res = await postJson('/tracker/nodes', 'not json');
    expect(res.status).toBe(400);
  });

  it('rejects a vnode whose anchor is not registered', async () => {
    const { node_id: anchorId } = freshNode();
    const { node_id, uri } = freshNode();
    const res = await postJson('/tracker/nodes', {
      node_id,
      uri,
      anchor_id: anchorId,
      vnode_proof: { vnode_id: node_id, anchor_id: anchorId, index: 0 },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('BadRequest');
  });
});
