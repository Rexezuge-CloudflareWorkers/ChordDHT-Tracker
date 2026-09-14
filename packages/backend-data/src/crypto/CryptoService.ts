import type { VNodeProof } from '@chord-dht-tracker/shared';

const encoder = new TextEncoder();

// Module-level cache: survives within a Worker isolate lifetime. Mutating the
// holder's properties (rather than reassigning a top-level binding) keeps the
// isolate cache without tripping no-top-level-assignment-in-function.
const caKeyCache: { key: CryptoKey | null; base64: string | null } = { key: null, base64: null };

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

// base64StdDecode decodes standard base64 (with padding, +/ chars) to ArrayBuffer.
function base64StdDecode(s: string): ArrayBuffer {
  const binary = atob(s);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.codePointAt(i) ?? 0;
  return buf;
}

// CryptoService hosts Tracker Ed25519/vnode crypto moved verbatim from
// apps/api/src/db.ts (deriveVNodeID, verifyVNodeProof, getCAPublicKey) and
// apps/api/src/auth.ts (importEd25519PublicKey).
class CryptoService {
  // getCAPublicKey imports and caches the CA Ed25519 public key from the Secrets Store.
  // Returns null if the secret is absent, unconfigured (placeholder), or not a valid Ed25519 key.
  public async getCAPublicKey(env: Pick<CloudflareEnv, 'CA_PUBLIC_KEY_BASE64'>): Promise<CryptoKey | null> {
    try {
      const b64 = await env.CA_PUBLIC_KEY_BASE64.get();
      if (!b64) return null;
      if (caKeyCache.key && caKeyCache.base64 === b64) return caKeyCache.key;
      caKeyCache.key = await this.importEd25519PublicKey(b64);
      caKeyCache.base64 = b64;
      return caKeyCache.key;
    } catch {
      return null;
    }
  }

  // importEd25519PublicKey imports a raw 32-byte Ed25519 public key from base64url.
  public async importEd25519PublicKey(base64url: string): Promise<CryptoKey> {
    const keyBuf = base64urlDecode(base64url);
    if (keyBuf.byteLength !== 32) {
      throw new Error('Ed25519 public key must be 32 bytes');
    }
    return crypto.subtle.importKey('raw', keyBuf, { name: 'Ed25519' }, false, ['verify']);
  }

  // deriveVNodeID computes SHA1("chord-vnode-v4\n" + anchorID + "\n" + index), matching Go.
  public async deriveVNodeID(anchorID: string, index: number): Promise<string> {
    const input = `chord-vnode-v4\n${anchorID}\n${index}`;
    // eslint-disable-next-line sonarjs/hashing -- SHA-1 is the Chord ring identifier hash (protocol compat), not a security digest.
    const hashBuf = await crypto.subtle.digest('SHA-1', encoder.encode(input));
    return Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // verifyVNodeProof verifies a VNodeProof against the anchor's Ed25519 public key.
  // anchorPubBase64Url is the anchor's public key in standard base64 (from the CA certificate's
  // public_key field, which is base64url — caller must normalise before passing).
  public async verifyVNodeProof(proof: VNodeProof, anchorPubBase64Url: string): Promise<boolean> {
    // anchorPubBase64Url is base64url raw; convert to raw 32-byte key.
    const padded = anchorPubBase64Url.replaceAll('-', '+').replaceAll('_', '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const b64 = padded + '='.repeat(padLen);
    const pubKeyBuf = base64StdDecode(b64);
    if (pubKeyBuf.byteLength !== 32) return false;

    const key = await crypto.subtle.importKey('raw', pubKeyBuf, { name: 'Ed25519' }, false, ['verify']);

    // Check expiry.
    const now = Math.floor(Date.now() / 1000);
    if (proof.expires_at < now) return false;

    // Recompute expected vnode_id.
    const expected = await this.deriveVNodeID(proof.anchor_id, proof.index);
    if (expected !== proof.vnode_id) return false;

    // Verify Ed25519 signature over canonical form.
    const canonical = `chord-vnode-proof-v4\n${proof.vnode_id}\n${proof.anchor_id}\n${proof.index}\n${proof.issued_at}\n${proof.expires_at}`;
    const sigBuf = base64StdDecode(proof.signature);
    return crypto.subtle.verify({ name: 'Ed25519' }, key, sigBuf, encoder.encode(canonical));
  }
}

export { CryptoService };
