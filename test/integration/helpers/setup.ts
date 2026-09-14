// Shared setup for the pool-workers integration suite: schema migration,
// secrets-store seeding, SELF request helpers, and real-crypto factories for
// CA certificates, CRLs, and vnode proofs (no mocks — every suite runs
// against the real worker with a real, per-file isolated D1).
import { adminSecretsStore, SELF } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { applyMigrations } from './migrations';

interface IntegrationEnv {
  DB: D1Database;
  CRON_TASKS: DurableObjectNamespace;
  ADMIN_SECRET: { get(): Promise<string | null> };
  CA_PUBLIC_KEY_BASE64: { get(): Promise<string | null> };
}

interface CertificateShape {
  version: number;
  node_id: string;
  uri: string;
  public_key: string;
  issued_at: number;
  expires_at: number;
  signature: string;
}

interface VNodeProofShape {
  vnode_id: string;
  anchor_id: string;
  index: number;
  issued_at: number;
  expires_at: number;
  anchor_pub: string;
  signature: string;
}

const testEnv = env as unknown as IntegrationEnv;

const ADMIN_SECRET_VALUE = 'integration-test-admin-secret';
const BASE_URL = 'https://tracker.test';

let nodeCounter = 0;

// setupIntegration migrates the test D1 and seeds the secrets-store bindings.
// Call once in beforeAll. Each test file gets an isolated D1 + secrets store,
// so state never leaks between files.
async function setupIntegration(options: { caPublicKeyB64Url?: string } = {}): Promise<IntegrationEnv> {
  await applyMigrations(testEnv.DB);
  await adminSecretsStore(testEnv.ADMIN_SECRET).create(ADMIN_SECRET_VALUE);
  if (options.caPublicKeyB64Url !== undefined) {
    await adminSecretsStore(testEnv.CA_PUBLIC_KEY_BASE64).create(options.caPublicKeyB64Url);
  }
  return testEnv;
}

// freshNode returns a unique 40-hex node_id + https URI pair for this file.
function freshNode(): { node_id: string; uri: string } {
  nodeCounter += 1;
  return {
    node_id: `f${nodeCounter.toString(16).padStart(39, '0')}`,
    uri: `https://node-${nodeCounter}.example`,
  };
}

function adminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${ADMIN_SECRET_VALUE}` };
}

function api(path: string, init: RequestInit = {}): Promise<Response> {
  return SELF.fetch(new Request(`${BASE_URL}${path}`, init));
}

function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function registerNode(
  nodeId: string,
  uri: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const res = await postJson('/tracker/nodes', { node_id: nodeId, uri, ...extra }, headers);
  if (res.status !== 200) {
    throw new Error(`registerNode failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

// --- WebCrypto helpers (real Ed25519/SHA-1, matching apps/api/src/auth.ts) ---

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesToB64Std(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha1Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)));
  return Array.from(digest)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// uriNodeId derives the canonical node_id for a URI: SHA-1 of the normalized
// form the worker verifies (lowercase host, default :443 dropped). Certificates
// are only valid when cert.node_id matches this digest.
async function uriNodeId(uri: string): Promise<string> {
  const url = new URL(uri.trim());
  const host = url.hostname.toLowerCase();
  const port = url.port === '443' || url.port === '' ? '' : `:${url.port}`;
  return sha1Hex(`https://${host}${port}`);
}

async function generateEd25519Keypair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
}

async function exportPublicKeyB64Url(key: CryptoKey): Promise<string> {
  return bytesToB64Url(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

async function exportPublicKeyB64Std(key: CryptoKey): Promise<string> {
  return bytesToB64Std(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

async function signB64Url(privateKey: CryptoKey, message: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, new TextEncoder().encode(message)));
  return bytesToB64Url(sig);
}

async function signB64Std(privateKey: CryptoKey, message: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, new TextEncoder().encode(message)));
  return bytesToB64Std(sig);
}

// makeCertificate builds a CA-signed node certificate with the canonical
// `chord-cert-v1` signing input the worker verifies.
async function makeCertificate(options: {
  caPrivateKey: CryptoKey;
  node_id: string;
  uri: string;
  publicKeyB64Url: string;
  issuedAt: number;
  expiresAt: number;
}): Promise<CertificateShape> {
  const { caPrivateKey, node_id, uri, publicKeyB64Url, issuedAt, expiresAt } = options;
  const signature = await signB64Url(
    caPrivateKey,
    `chord-cert-v1\nnode_id=${node_id}\nuri=${uri}\npublic_key=${publicKeyB64Url}\nissued_at=${issuedAt}\nexpires_at=${expiresAt}`,
  );
  return { version: 1, node_id, uri, public_key: publicKeyB64Url, issued_at: issuedAt, expires_at: expiresAt, signature };
}

// deriveVNodeID mirrors the worker: SHA1("chord-vnode-v4\n" + anchor + "\n" + index).
async function deriveVNodeID(anchorID: string, index: number): Promise<string> {
  return sha1Hex(`chord-vnode-v4\n${anchorID}\n${index}`);
}

// makeVNodeProof builds an anchor-signed proof with the canonical
// `chord-vnode-proof-v4` input; the signature uses standard base64 as the
// worker's verifier expects.
async function makeVNodeProof(options: {
  anchorPrivateKey: CryptoKey;
  anchorPublicKeyB64Std: string;
  vnode_id: string;
  anchor_id: string;
  index: number;
  issuedAt: number;
  expiresAt: number;
}): Promise<VNodeProofShape> {
  const { anchorPrivateKey, anchorPublicKeyB64Std, vnode_id, anchor_id, index, issuedAt, expiresAt } = options;
  const signature = await signB64Std(
    anchorPrivateKey,
    `chord-vnode-proof-v4\n${vnode_id}\n${anchor_id}\n${index}\n${issuedAt}\n${expiresAt}`,
  );
  return {
    vnode_id,
    anchor_id,
    index,
    issued_at: issuedAt,
    expires_at: expiresAt,
    anchor_pub: anchorPublicKeyB64Std,
    signature,
  };
}

// makeCRL builds a CA-signed revocation list with the canonical
// `chord-crl-v1` signing input the worker verifies.
async function makeCRL(options: {
  caPrivateKey: CryptoKey;
  version: number;
  updatedAt: number;
  revokedIds: string[];
}): Promise<{ version: number; updated_at: number; revoked_node_ids: string[]; signature: string }> {
  const { caPrivateKey, version, updatedAt, revokedIds } = options;
  const signature = await signB64Url(
    caPrivateKey,
    `chord-crl-v1\nversion=${version}\nupdated_at=${updatedAt}\nrevoked_node_ids=${[...revokedIds].sort().join(',')}`,
  );
  return { version, updated_at: updatedAt, revoked_node_ids: revokedIds, signature };
}

export {
  ADMIN_SECRET_VALUE,
  adminHeaders,
  api,
  deriveVNodeID,
  exportPublicKeyB64Std,
  exportPublicKeyB64Url,
  freshNode,
  generateEd25519Keypair,
  makeCertificate,
  makeCRL,
  makeVNodeProof,
  postJson,
  registerNode,
  setupIntegration,
  uriNodeId,
};
export type { CertificateShape, IntegrationEnv, VNodeProofShape };
