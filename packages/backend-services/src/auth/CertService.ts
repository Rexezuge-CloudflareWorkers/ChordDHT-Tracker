import { CryptoService } from '@chord-dht-tracker/backend-data/crypto';
import { BadRequestError } from '@chord-dht-tracker/backend-errors';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import type { Certificate } from '@chord-dht-tracker/shared';

const encoder = new TextEncoder();

// encodeMessage converts a string to an ArrayBuffer suitable for crypto.subtle.
function encodeMessage(s: string): ArrayBuffer {
  const encoded = encoder.encode(s);
  // Copy into a plain ArrayBuffer to satisfy TypeScript's strict BufferSource typing.
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

// base64urlDecode decodes a base64url string without padding into an ArrayBuffer.
function base64urlDecode(s: string): ArrayBuffer {
  // Add padding and convert base64url → base64
  const padded = s.replaceAll('-', '+').replaceAll('_', '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(padLen);
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.codePointAt(i) ?? 0;
  }
  return buf;
}

// base64urlDecodeLength returns the byte length of a decoded base64url string without decoding.
function base64urlDecodeLength(s: string): number {
  const padded = s.replaceAll('-', '+').replaceAll('_', '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(padLen);
  return (b64.length * 3) / 4 - padLen;
}

// Narrow view of ServiceEnv for this service; the constructor takes the full
// ServiceEnv so the composition root passes its typed env directly.
type CertServiceEnv = Pick<ServiceEnv, 'CA_PUBLIC_KEY_BASE64'>;

interface CertServiceDeps {
  caKey?: () => Promise<CryptoKey | null>;
  crypto?: CryptoService;
}

interface CrlPayload {
  version: number;
  updated_at: number;
  revoked_node_ids: string[];
  signature: string;
}

// CertService hosts the Tracker certificate/CRL WebCrypto helpers moved
// verbatim from apps/api/src/auth.ts. Generic Errors become BadRequestError
// (all cert failures previously surfaced as 400 INVALID_REQUEST/INVALID_CERTIFICATE).
// CA key loading delegates to the injected `caKey` factory (memoized per
// request by the composition root); vnode crypto lives in backend-data's
// CryptoService and is reached via VNodeService.
class CertService {
  private readonly deps: Required<CertServiceDeps>;

  constructor(
    private readonly env: ServiceEnv,
    deps: CertServiceDeps = {},
  ) {
    const crypto = deps.crypto ?? new CryptoService();
    this.deps = {
      crypto,
      // Default loads via backend-data's CryptoService (isolate-level key
      // cache); the composition root overrides with a memoized per-request
      // factory so warm requests skip the Secrets Store round-trip.
      caKey: () => crypto.getCAPublicKey(env),
      ...deps,
    };
  }

  // getCAPublicKey returns the memoized CA Ed25519 key, or null when the
  // secret is absent/unconfigured/invalid (mirrors db.ts semantics).
  public async getCAPublicKey(): Promise<CryptoKey | null> {
    return this.deps.caKey();
  }

  // certSignedMessage builds the canonical signing input matching Go's certSignedMessage.
  // Format: "chord-cert-v1\nnode_id={}\nuri={}\npublic_key={}\nissued_at={}\nexpires_at={}"
  public certSignedMessage(cert: Certificate): ArrayBuffer {
    const msg = `chord-cert-v1\nnode_id=${cert.node_id}\nuri=${cert.uri}\npublic_key=${cert.public_key}\nissued_at=${cert.issued_at}\nexpires_at=${cert.expires_at}`;
    return encodeMessage(msg);
  }

  // crlSignedMessage builds the canonical signing input for a CRL.
  // Format: "chord-crl-v1\nversion={}\nupdated_at={}\nrevoked_node_ids={sorted,comma-separated}"
  public crlSignedMessage(version: number, updatedAt: number, revokedIds: string[]): ArrayBuffer {
    // eslint-disable-next-line unicorn/require-array-sort-compare, sonarjs/no-alphabetical-sort -- byte-order (code-unit) sort is the canonical CRL signing input; localeCompare would break cross-locale signature verification.
    const sorted = [...revokedIds].sort().join(',');
    const msg = `chord-crl-v1\nversion=${version}\nupdated_at=${updatedAt}\nrevoked_node_ids=${sorted}`;
    return encodeMessage(msg);
  }

  // normalizeURI applies the same rules as Go's chord.NormalizeURI.
  public normalizeURI(raw: string): string {
    let u: URL;
    try {
      u = new URL(raw.trim());
    } catch {
      throw new BadRequestError('uri must use https scheme');
    }
    if (u.protocol !== 'https:') throw new BadRequestError('uri must use https scheme');
    if (u.username || u.password || u.search || u.hash) {
      throw new BadRequestError('uri must be absolute https without userinfo, query, or fragment');
    }
    if (u.pathname && u.pathname !== '/') {
      throw new BadRequestError('uri must not include a path');
    }
    const host = u.hostname.toLowerCase();
    const port = u.port;
    if (port === '443' || port === '') {
      return `https://${host}`;
    }
    return `https://${host}:${port}`;
  }

  // hashURI returns the hex SHA-1 of the normalized URI, matching Go's HashURI.
  public async hashURI(uri: string): Promise<string> {
    const normalized = this.normalizeURI(uri);
    const data = encoder.encode(normalized);
    // eslint-disable-next-line sonarjs/hashing -- SHA-1 is the Chord ring identifier hash (protocol compat), not a security digest.
    const hashBuf = await crypto.subtle.digest('SHA-1', data);
    return Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // verifyCertificate performs full certificate verification per spec §2.4.
  // Returns the parsed Certificate on success, throws BadRequestError on any failure.
  public async verifyCertificate(certInput: unknown, caKey: CryptoKey): Promise<Certificate> {
    if (typeof certInput !== 'object' || certInput === null) {
      throw new BadRequestError('certificate must be a JSON object');
    }
    const cert = certInput as Certificate;

    // Step 1: Format check
    if (cert.version !== 1) throw new BadRequestError('unsupported certificate version');
    if (typeof cert.node_id !== 'string' || !/^[0-9a-f]{40}$/.test(cert.node_id)) {
      throw new BadRequestError('cert node_id must be 40 lowercase hex characters');
    }
    if (base64urlDecodeLength(cert.public_key ?? '') !== 32) {
      throw new BadRequestError('cert public_key must be 32 bytes');
    }
    if (typeof cert.issued_at !== 'number' || typeof cert.expires_at !== 'number') {
      throw new BadRequestError('cert issued_at and expires_at must be numbers');
    }
    if (cert.issued_at >= cert.expires_at) throw new BadRequestError('cert issued_at must be before expires_at');

    // Step 2: URI → node_id consistency
    const expectedID = await this.hashURI(cert.uri);
    if (cert.node_id !== expectedID) {
      throw new BadRequestError(`cert node_id ${cert.node_id} does not match sha1(uri) ${expectedID}`);
    }

    // Step 3: CA signature
    const valid = await this.verifyCertificateSignature(cert, caKey);
    if (!valid) throw new BadRequestError('cert CA signature verification failed');

    // Step 4: Validity period (±5 min tolerance)
    const nowSecs = Math.floor(Date.now() / 1000);
    const tol = 300;
    if (nowSecs < cert.issued_at - tol) throw new BadRequestError('cert not yet valid');
    if (nowSecs > cert.expires_at + tol) throw new BadRequestError('cert has expired');

    return cert;
  }

  // verifyCRL checks the CA signature on a CRL object.
  public async verifyCRL(crl: CrlPayload, caKey: CryptoKey): Promise<boolean> {
    const msg = this.crlSignedMessage(crl.version, crl.updated_at, crl.revoked_node_ids);
    const sig = base64urlDecode(crl.signature);
    return crypto.subtle.verify({ name: 'Ed25519' }, caKey, sig, msg);
  }

  // verifyCertificateSignature checks only the CA's Ed25519 signature over the cert.
  private async verifyCertificateSignature(cert: Certificate, caKey: CryptoKey): Promise<boolean> {
    const msg = this.certSignedMessage(cert);
    const sig = base64urlDecode(cert.signature);
    return crypto.subtle.verify({ name: 'Ed25519' }, caKey, sig, msg);
  }
}

export { CertService };
export type { CertServiceDeps, CertServiceEnv, CrlPayload };
