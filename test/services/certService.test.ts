import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '@chord-dht-tracker/backend-errors';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import { CertService } from '@chord-dht-tracker/backend-services/auth';

const encoder = new TextEncoder();
const URI = 'https://cert-node.example.com';

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCA() {
  const keypair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keypair.publicKey));
  return { keypair, publicB64: b64url(raw) };
}

function serviceWithCA(publicB64: string | null, throws = false) {
  const get = throws ? vi.fn().mockRejectedValue(new Error('store down')) : vi.fn().mockResolvedValue(publicB64);
  const service = new CertService({ CA_PUBLIC_KEY_BASE64: { get } } as unknown as ServiceEnv);
  return { service, get };
}

interface TestCert {
  version: number;
  node_id: string;
  uri: string;
  public_key: string;
  issued_at: number;
  expires_at: number;
  signature: string;
}

async function signedCert(service: CertService, privateKey: CryptoKey, overrides: Partial<TestCert> = {}): Promise<TestCert> {
  const nodeId = await service.hashURI(URI);
  const nodePub = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const nowSecs = Math.floor(Date.now() / 1000);
  const cert: TestCert = {
    version: 1,
    node_id: nodeId,
    uri: URI,
    public_key: nodePub,
    issued_at: nowSecs - 60,
    expires_at: nowSecs + 3600,
    signature: '',
  };
  const finalCert = { ...cert, ...overrides };
  const msg = `chord-cert-v1\nnode_id=${finalCert.node_id}\nuri=${finalCert.uri}\npublic_key=${finalCert.public_key}\nissued_at=${finalCert.issued_at}\nexpires_at=${finalCert.expires_at}`;
  // The service builder must produce the identical canonical input.
  expect(new Uint8Array(service.certSignedMessage(finalCert as never))).toEqual(new Uint8Array(encoder.encode(msg)));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, encoder.encode(msg)));
  finalCert.signature = b64url(sig);
  return finalCert;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CertService URI helpers', () => {
  it('normalizes https URIs to origin form', () => {
    const { service } = serviceWithCA(null);

    expect(service.normalizeURI('https://Example.COM/')).toBe('https://example.com');
    expect(service.normalizeURI('https://example.com:8443')).toBe('https://example.com:8443');
    expect(service.normalizeURI('https://example.com:443')).toBe('https://example.com');
  });

  it('rejects non-origin URIs', () => {
    const { service } = serviceWithCA(null);

    for (const bad of [
      'http://example.com',
      'https://example.com/path',
      'https://example.com/?q=1',
      'https://example.com/#frag',
      'https://user@example.com',
      'not-a-url',
    ]) {
      expect(() => service.normalizeURI(bad)).toThrow(BadRequestError);
    }
  });

  it('hashURI matches SHA-1 of the normalized URI', async () => {
    const { service } = serviceWithCA(null);

    const expected = createHash('sha1').update('https://example.com').digest('hex');
    await expect(service.hashURI('https://Example.COM/')).resolves.toBe(expected);
  });

  it('crlSignedMessage sorts revoked ids', () => {
    const { service } = serviceWithCA(null);
    const b = 'b'.repeat(40);
    const a = 'a'.repeat(40);

    const msg = new TextDecoder().decode(service.crlSignedMessage(2, 100, [b, a]));
    expect(msg).toBe(`chord-crl-v1\nversion=2\nupdated_at=100\nrevoked_node_ids=${a},${b}`);
  });
});

describe('CertService CA key loading', () => {
  it('imports a valid CA public key', async () => {
    const { publicB64, keypair } = await generateCA();
    const { service } = serviceWithCA(publicB64);

    const key = await service.getCAPublicKey();
    expect(key).toBeInstanceOf(CryptoKey);
    // The imported key verifies signatures from the matching private key.
    const data = encoder.encode('probe');
    const sig = await crypto.subtle.sign({ name: 'Ed25519' }, keypair.privateKey, data);
    await expect(crypto.subtle.verify({ name: 'Ed25519' }, key!, sig, data)).resolves.toBe(true);
  });

  it('returns null when the secret is absent, invalid, or unreadable', async () => {
    const { publicB64 } = await generateCA();

    await expect(serviceWithCA(null).service.getCAPublicKey()).resolves.toBeNull();
    await expect(serviceWithCA('not-a-key').service.getCAPublicKey()).resolves.toBeNull();
    await expect(serviceWithCA(publicB64, true).service.getCAPublicKey()).resolves.toBeNull();
  });
});

describe('CertService certificate verification', () => {
  it('accepts a correctly signed certificate', async () => {
    const { keypair } = await generateCA();
    const { service } = serviceWithCA(null);

    const cert = await signedCert(service, keypair.privateKey);
    await expect(service.verifyCertificate(cert, keypair.publicKey)).resolves.toEqual(cert);
  });

  it('rejects malformed certificates', async () => {
    const { keypair } = await generateCA();
    const { service } = serviceWithCA(null);

    await expect(service.verifyCertificate(null, keypair.publicKey)).rejects.toThrow(BadRequestError);
    await expect(
      service.verifyCertificate(await signedCert(service, keypair.privateKey, { version: 2 }), keypair.publicKey),
    ).rejects.toThrow(/unsupported certificate version/);
    await expect(
      service.verifyCertificate(
        await signedCert(service, keypair.privateKey, { node_id: 'ZZZ' }),
        keypair.publicKey,
      ),
    ).rejects.toThrow(/40 lowercase hex/);
    await expect(
      service.verifyCertificate(await signedCert(service, keypair.privateKey, { public_key: 'AAA' }), keypair.publicKey),
    ).rejects.toThrow(/32 bytes/);
    const nowSecs = Math.floor(Date.now() / 1000);
    await expect(
      service.verifyCertificate(
        await signedCert(service, keypair.privateKey, { issued_at: nowSecs, expires_at: nowSecs }),
        keypair.publicKey,
      ),
    ).rejects.toThrow(/before expires_at/);
  });

  it('rejects node id mismatches and bad signatures', async () => {
    const { keypair } = await generateCA();
    const other = await generateCA();
    const { service } = serviceWithCA(null);

    const mismatched = await signedCert(service, keypair.privateKey);
    mismatched.node_id = 'c'.repeat(40);
    // Re-sign so the failure is the binding check, not the signature.
    const reMsg = `chord-cert-v1\nnode_id=${mismatched.node_id}\nuri=${mismatched.uri}\npublic_key=${mismatched.public_key}\nissued_at=${mismatched.issued_at}\nexpires_at=${mismatched.expires_at}`;
    mismatched.signature = b64url(
      new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, keypair.privateKey, encoder.encode(reMsg))),
    );
    await expect(service.verifyCertificate(mismatched, keypair.publicKey)).rejects.toThrow(/does not match sha1/);

    const wrongKey = await signedCert(service, other.keypair.privateKey);
    await expect(service.verifyCertificate(wrongKey, keypair.publicKey)).rejects.toThrow(/signature verification failed/);
  });

  it('enforces the validity window with tolerance', async () => {
    const { keypair } = await generateCA();
    const { service } = serviceWithCA(null);
    const nowSecs = Math.floor(Date.now() / 1000);

    const expired = await signedCert(service, keypair.privateKey, {
      issued_at: nowSecs - 7200,
      expires_at: nowSecs - 600,
    });
    await expect(service.verifyCertificate(expired, keypair.publicKey)).rejects.toThrow(/expired/);

    const premature = await signedCert(service, keypair.privateKey, {
      issued_at: nowSecs + 600,
      expires_at: nowSecs + 3600,
    });
    await expect(service.verifyCertificate(premature, keypair.publicKey)).rejects.toThrow(/not yet valid/);
  });
});

describe('CertService CRL verification', () => {
  it('verifies a correctly signed CRL', async () => {
    const { keypair, publicB64 } = await generateCA();
    const { service } = serviceWithCA(publicB64);
    const caKey = (await service.getCAPublicKey())!;
    const revoked = ['b'.repeat(40), 'a'.repeat(40)];

    const msg = service.crlSignedMessage(2, 1780000000, revoked);
    const sig = b64url(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, keypair.privateKey, msg)));
    const crl = { version: 2, updated_at: 1780000000, revoked_node_ids: revoked, signature: sig };

    await expect(service.verifyCRL(crl, caKey)).resolves.toBe(true);
    await expect(service.verifyCRL({ ...crl, revoked_node_ids: ['c'.repeat(40)] }, caKey)).resolves.toBe(false);
  });
});
