import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';
import { okStmt } from '../dao/helpers';

const encoder = new TextEncoder();

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

async function signCRL(
  privateKey: CryptoKey,
  version: number,
  updatedAt: number,
  revokedIds: string[],
): Promise<string> {
  const msg = `chord-crl-v1\nversion=${version}\nupdated_at=${updatedAt}\nrevoked_node_ids=${[...revokedIds].sort().join(',')}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, encoder.encode(msg)));
  return b64url(sig);
}

function envWithCA(db: D1Database, caPublicB64: string): Env {
  return { ...createEnv(db), CA_PUBLIC_KEY_BASE64: { get: async () => caPublicB64 } } as unknown as Env;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /tracker/crl', () => {
  it('returns the stored CRL as JSON', async () => {
    const crlJson = '{"version":2,"updated_at":1780000000,"revoked_node_ids":[]}';
    const db = createD1(createStmt({ firstResult: { crl_json: crlJson } }));

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(new Request('http://localhost/tracker/crl'), createEnv(db), {} as ExecutionContext);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.text()).toBe(crlJson);
  });

  it('returns 404 when no CRL is stored', async () => {
    const db = createD1(createStmt({ firstResult: null }));

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(new Request('http://localhost/tracker/crl'), createEnv(db), {} as ExecutionContext);

    expect(res.status).toBe(404);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('NotFound');
  });
});

describe('POST /tracker/crl', () => {
  it('returns 503 when the CA key is not configured', async () => {
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/crl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, updated_at: 1, revoked_node_ids: [], signature: 'x' }),
      }),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(503);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('ServiceUnavailable');
  });

  it('returns 400 for invalid JSON', async () => {
    const { publicB64 } = await generateCA();
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/crl', { method: 'POST', body: 'not json' }),
      envWithCA(db, publicB64),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when required CRL fields are missing', async () => {
    const { publicB64 } = await generateCA();
    const db = createD1();
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/crl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1 }),
      }),
      envWithCA(db, publicB64),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature is invalid', async () => {
    const { keypair, publicB64 } = await generateCA();
    const other = await generateCA();
    const revoked = ['a'.repeat(40)];
    const signature = await signCRL(other.keypair.privateKey, 2, 1780000000, revoked);
    const db = createD1();
    void keypair;

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/crl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 2, updated_at: 1780000000, revoked_node_ids: revoked, signature }),
      }),
      envWithCA(db, publicB64),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('BadRequest');
  });

  it('returns 409 when the version is not newer', async () => {
    const { keypair, publicB64 } = await generateCA();
    const revoked: string[] = [];
    const signature = await signCRL(keypair.privateKey, 5, 1780000000, revoked);
    const db = createD1(createStmt({ firstResult: { version: 5 } }));

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/crl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 5, updated_at: 1780000000, revoked_node_ids: revoked, signature }),
      }),
      envWithCA(db, publicB64),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(409);
  });

  it('stores a valid CRL and returns the summary', async () => {
    const { keypair, publicB64 } = await generateCA();
    const revoked = ['b'.repeat(40), 'a'.repeat(40)];
    const signature = await signCRL(keypair.privateKey, 3, 1780000000, revoked);
    const insertStmt = okStmt();
    const db = createD1(createStmt({ firstResult: null }), insertStmt);

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/crl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 3, updated_at: 1780000000, revoked_node_ids: revoked, signature }),
      }),
      envWithCA(db, publicB64),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: boolean; version: number; revoked_count: number };
    expect(body).toEqual({ updated: true, version: 3, revoked_count: 2 });
    const bindArgs = (insertStmt.bind as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(bindArgs[0]).toBe(3);
    expect(bindArgs[1]).toBe(1780000000);
    expect(JSON.parse(bindArgs[2] as string)).toMatchObject({ version: 3, revoked_node_ids: revoked });
  });
});
