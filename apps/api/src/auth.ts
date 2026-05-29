import type { Certificate } from '@/types';

const encoder = new TextEncoder();

// isAdmin checks Authorization: Bearer <token> against ADMIN_SECRET using constant-time HMAC comparison.
export async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const provided = auth.slice(7);
  if (!provided) return false;

  let secret: string | null;
  try {
    secret = await env.ADMIN_SECRET.get();
  } catch {
    return false;
  }
  if (!secret) return false;

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const [mac1, mac2] = await Promise.all([
    crypto.subtle.sign('HMAC', key, encoder.encode(provided)),
    crypto.subtle.sign('HMAC', key, encoder.encode(secret)),
  ]);
  const a = new Uint8Array(mac1);
  const b = new Uint8Array(mac2);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// encodeMessage converts a string to an ArrayBuffer suitable for crypto.subtle.
function encodeMessage(s: string): ArrayBuffer {
  const encoded = encoder.encode(s);
  // Copy into a plain ArrayBuffer to satisfy TypeScript's strict BufferSource typing.
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

// certSignedMessage builds the canonical signing input matching Go's certSignedMessage.
// Format: "chord-cert-v1\nnode_id={}\nuri={}\npublic_key={}\nissued_at={}\nexpires_at={}"
function certSignedMessage(cert: Certificate): ArrayBuffer {
  const msg = `chord-cert-v1\nnode_id=${cert.node_id}\nuri=${cert.uri}\npublic_key=${cert.public_key}\nissued_at=${cert.issued_at}\nexpires_at=${cert.expires_at}`;
  return encodeMessage(msg);
}

// crlSignedMessage builds the canonical signing input for a CRL.
// Format: "chord-crl-v1\nversion={}\nupdated_at={}\nrevoked_node_ids={sorted,comma-separated}"
export function crlSignedMessage(version: number, updatedAt: number, revokedIds: string[]): ArrayBuffer {
  const sorted = [...revokedIds].sort().join(',');
  const msg = `chord-crl-v1\nversion=${version}\nupdated_at=${updatedAt}\nrevoked_node_ids=${sorted}`;
  return encodeMessage(msg);
}

// base64urlDecode decodes a base64url string without padding into an ArrayBuffer.
function base64urlDecode(s: string): ArrayBuffer {
  // Add padding and convert base64url → base64
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(padLen);
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buf;
}

// base64urlDecodeLength returns the byte length of a decoded base64url string without decoding.
function base64urlDecodeLength(s: string): number {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(padLen);
  return (b64.length * 3) / 4 - padLen;
}

// importEd25519PublicKey imports a raw 32-byte Ed25519 public key from base64url.
export async function importEd25519PublicKey(base64url: string): Promise<CryptoKey> {
  const keyBuf = base64urlDecode(base64url);
  if (keyBuf.byteLength !== 32) {
    throw new Error('Ed25519 public key must be 32 bytes');
  }
  return crypto.subtle.importKey('raw', keyBuf, { name: 'Ed25519' }, false, ['verify']);
}

// verifyCertificateSignature checks only the CA's Ed25519 signature over the cert.
async function verifyCertificateSignature(cert: Certificate, caKey: CryptoKey): Promise<boolean> {
  const msg = certSignedMessage(cert);
  const sig = base64urlDecode(cert.signature);
  return crypto.subtle.verify({ name: 'Ed25519' }, caKey, sig, msg);
}

// normalizeURI applies the same rules as Go's chord.NormalizeURI.
export function normalizeURI(raw: string): string {
  const trimmed = raw.trim();
  const u = new URL(trimmed);
  if (u.protocol !== 'https:') throw new Error('uri must use https scheme');
  if (u.username || u.password || u.search || u.hash) {
    throw new Error('uri must be absolute https without userinfo, query, or fragment');
  }
  if (u.pathname && u.pathname !== '/') {
    throw new Error('uri must not include a path');
  }
  const host = u.hostname.toLowerCase();
  const port = u.port;
  if (port === '443' || port === '') {
    return `https://${host}`;
  }
  return `https://${host}:${port}`;
}

// hashURI returns the hex SHA-1 of the normalized URI, matching Go's HashURI.
export async function hashURI(uri: string): Promise<string> {
  const normalized = normalizeURI(uri);
  const data = encoder.encode(normalized);
  const hashBuf = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// verifyCertificate performs full certificate verification per spec §2.4.
// Returns the parsed Certificate on success, throws on any failure.
export async function verifyCertificate(certInput: unknown, caKey: CryptoKey): Promise<Certificate> {
  if (typeof certInput !== 'object' || certInput === null) {
    throw new Error('certificate must be a JSON object');
  }
  const cert = certInput as Certificate;

  // Step 1: Format check
  if (cert.version !== 1) throw new Error('unsupported certificate version');
  if (typeof cert.node_id !== 'string' || !/^[0-9a-f]{40}$/.test(cert.node_id)) {
    throw new Error('cert node_id must be 40 lowercase hex characters');
  }
  if (base64urlDecodeLength(cert.public_key ?? '') !== 32) throw new Error('cert public_key must be 32 bytes');
  if (typeof cert.issued_at !== 'number' || typeof cert.expires_at !== 'number') {
    throw new Error('cert issued_at and expires_at must be numbers');
  }
  if (cert.issued_at >= cert.expires_at) throw new Error('cert issued_at must be before expires_at');

  // Step 2: URI → node_id consistency
  const expectedID = await hashURI(cert.uri);
  if (cert.node_id !== expectedID) {
    throw new Error(`cert node_id ${cert.node_id} does not match sha1(uri) ${expectedID}`);
  }

  // Step 3: CA signature
  const valid = await verifyCertificateSignature(cert, caKey);
  if (!valid) throw new Error('cert CA signature verification failed');

  // Step 4: Validity period (±5 min tolerance)
  const nowSecs = Math.floor(Date.now() / 1000);
  const tol = 300;
  if (nowSecs < cert.issued_at - tol) throw new Error('cert not yet valid');
  if (nowSecs > cert.expires_at + tol) throw new Error('cert has expired');

  return cert;
}

// verifyCRL checks the CA signature on a CRL object.
export async function verifyCRL(
  crl: { version: number; updated_at: number; revoked_node_ids: string[]; signature: string },
  caKey: CryptoKey,
): Promise<boolean> {
  const msg = crlSignedMessage(crl.version, crl.updated_at, crl.revoked_node_ids);
  const sig = base64urlDecode(crl.signature);
  return crypto.subtle.verify({ name: 'Ed25519' }, caKey, sig, msg);
}
