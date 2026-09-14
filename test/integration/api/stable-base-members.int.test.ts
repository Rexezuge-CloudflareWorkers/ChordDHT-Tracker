import { beforeAll, describe, expect, it } from 'vitest';
import { api, registerNode, setupIntegration, uriNodeId } from '../helpers/setup';
import type { IntegrationEnv } from '../helpers/setup';

const MEMBER_URIS = [
  'https://stable-0.example',
  'https://stable-1.example',
  'https://stable-2.example',
  'https://stable-3.example',
  'https://stable-4.example',
  'https://stable-5.example',
  'https://stable-6.example',
];

interface StableBaseBody {
  stable_base_min_size: number;
  configured_count: number;
  live_count: number;
  degraded: boolean;
  emergency: boolean;
  emergency_threshold: number;
  members: { node_id: string; uri: string; registered: boolean; live: boolean }[];
}

let testEnv: IntegrationEnv;

async function readStableBase(): Promise<StableBaseBody> {
  const res = await api('/tracker/stable_base');
  expect(res.status).toBe(200);
  return (await res.json()) as StableBaseBody;
}

beforeAll(async () => {
  testEnv = await setupIntegration();
});

describe('GET /tracker/stable_base with configured members', () => {
  it('uses emergency_threshold = floor(min_size / 2) + 1', async () => {
    const body = await readStableBase();
    expect(body.stable_base_min_size).toBe(6);
    expect(body.emergency_threshold).toBe(4);
    expect(body.configured_count).toBe(MEMBER_URIS.length);
  });

  it('counts a registered member as live and keeps degraded=true/emergency=false at 5/7', async () => {
    for (const uri of MEMBER_URIS.slice(0, 5)) {
      await registerNode(await uriNodeId(uri), uri);
    }
    const body = await readStableBase();
    expect(body.live_count).toBe(5);
    expect(body.degraded).toBe(true);
    expect(body.emergency).toBe(false);
  });

  it('reaches degraded=false once live members meet min_size', async () => {
    for (const uri of MEMBER_URIS.slice(5)) {
      await registerNode(await uriNodeId(uri), uri);
    }
    const body = await readStableBase();
    expect(body.live_count).toBe(7);
    expect(body.degraded).toBe(false);
    expect(body.emergency).toBe(false);
  });

  it('marks a member with stale last_seen as not live', async () => {
    const staleUri = MEMBER_URIS[0]!;
    const staleId = await uriNodeId(staleUri);
    const staleIso = new Date(Date.now() - 3600 * 1000).toISOString();
    await testEnv.DB.prepare('UPDATE nodes SET last_seen = ?, status = ? WHERE node_id = ?')
      .bind(staleIso, 'ACTIVE', staleId)
      .run();
    const body = await readStableBase();
    expect(body.live_count).toBe(6);
    const member = body.members.find((m) => m.node_id === staleId);
    expect(member?.registered).toBe(true);
    expect(member?.live).toBe(false);
    expect(body.degraded).toBe(false);
    expect(body.emergency).toBe(false);
  });

  it('marks a fresh but non-ACTIVE member as not live and exposes member fields', async () => {
    const leavingUri = MEMBER_URIS[1]!;
    const leavingId = await uriNodeId(leavingUri);
    await testEnv.DB.prepare('UPDATE nodes SET status = ? WHERE node_id = ?').bind('LEAVING', leavingId).run();
    const body = await readStableBase();
    expect(body.live_count).toBe(5);
    const member = body.members.find((m) => m.node_id === leavingId);
    expect(member?.registered).toBe(true);
    expect(member?.live).toBe(false);
    expect(member?.status).toBe('LEAVING');
    expect(member?.uri).toBe(leavingUri);
    expect(typeof member?.last_seen).toBe('string');
    expect(Number.isNaN(Date.parse(member!.last_seen!))).toBe(false);
    expect(body.degraded).toBe(true);
    expect(body.emergency).toBe(false);
  });

  it('reports emergency once live members drop below floor(min_size/2)+1', async () => {
    const staleIso = new Date(Date.now() - 3600 * 1000).toISOString();
    for (const uri of MEMBER_URIS.slice(2, 4)) {
      await testEnv.DB.prepare('UPDATE nodes SET last_seen = ? WHERE node_id = ?')
        .bind(staleIso, await uriNodeId(uri))
        .run();
    }
    const body = await readStableBase();
    expect(body.live_count).toBe(3);
    expect(body.emergency_threshold).toBe(4);
    expect(body.degraded).toBe(true);
    expect(body.emergency).toBe(true);
  });
});
