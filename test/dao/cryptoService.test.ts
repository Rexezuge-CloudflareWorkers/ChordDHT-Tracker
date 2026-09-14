import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoService } from '@chord-dht-tracker/backend-data/crypto';
import type { VNodeProof } from '@chord-dht-tracker/shared';

function toB64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function toB64Std(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CryptoService', () => {
  it('derives stable vnode ids', async () => {
    const crypto = new CryptoService();
    const anchorId = 'a'.repeat(40);
    const first = await crypto.deriveVNodeID(anchorId, 0);
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(await crypto.deriveVNodeID(anchorId, 0)).toBe(first);
    expect(await crypto.deriveVNodeID(anchorId, 1)).not.toBe(first);
  });

  it('imports 32-byte Ed25519 keys and rejects other lengths', async () => {
    const crypto = new CryptoService();
    const pair = await globalThis.crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', pair.publicKey));
    await expect(crypto.importEd25519PublicKey(toB64Url(raw))).resolves.toBeInstanceOf(Object);
    await expect(crypto.importEd25519PublicKey(toB64Url(new Uint8Array(16)))).rejects.toThrow(/32 bytes/);
  });

  it('verifies a well-formed vnode proof and rejects tampered ones', async () => {
    const crypto = new CryptoService();
    const subtle = globalThis.crypto.subtle;
    const anchorKeys = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const anchorPubRaw = new Uint8Array(await subtle.exportKey('raw', anchorKeys.publicKey));
    const anchorPubB64Url = toB64Url(anchorPubRaw);
    const anchorId = 'a'.repeat(40);
    const vnodeId = await crypto.deriveVNodeID(anchorId, 3);
    const now = Math.floor(Date.now() / 1000);
    const sign = async (message: string): Promise<string> =>
      toB64Std(new Uint8Array(await subtle.sign({ name: 'Ed25519' }, anchorKeys.privateKey, new TextEncoder().encode(message))));
    const proof: VNodeProof = {
      vnode_id: vnodeId,
      anchor_id: anchorId,
      index: 3,
      issued_at: now - 60,
      expires_at: now + 3600,
      anchor_pub: toB64Std(anchorPubRaw),
      signature: await sign(`chord-vnode-proof-v4\n${vnodeId}\n${anchorId}\n3\n${now - 60}\n${now + 3600}`),
    };
    await expect(crypto.verifyVNodeProof(proof, anchorPubB64Url)).resolves.toBe(true);
    await expect(crypto.verifyVNodeProof({ ...proof, vnode_id: 'c'.repeat(40) }, anchorPubB64Url)).resolves.toBe(false);
    await expect(crypto.verifyVNodeProof({ ...proof, expires_at: now - 10 }, anchorPubB64Url)).resolves.toBe(false);
    await expect(crypto.verifyVNodeProof(proof, toB64Url(new Uint8Array(16)))).resolves.toBe(false);
  });

  it('loads and caches the CA key, null when unconfigured', async () => {
    const crypto = new CryptoService();
    await expect(crypto.getCAPublicKey({ CA_PUBLIC_KEY_BASE64: { get: async () => null } })).resolves.toBeNull();
    await expect(
      crypto.getCAPublicKey({ CA_PUBLIC_KEY_BASE64: { get: async () => { throw new Error('nope'); } } }),
    ).resolves.toBeNull();

    const pair = await globalThis.crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', pair.publicKey));
    const env = { CA_PUBLIC_KEY_BASE64: { get: vi.fn().mockResolvedValue(toB64Url(raw)) } };
    const first = await crypto.getCAPublicKey(env);
    expect(first).not.toBeNull();
    const second = await crypto.getCAPublicKey(env);
    expect(second).toBe(first);
  });
});
