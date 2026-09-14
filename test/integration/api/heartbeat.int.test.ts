import { beforeAll, describe, expect, it } from 'vitest';
import {
  adminHeaders,
  api,
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
} from '../helpers/setup';

let anchorId = '';
let vnodeId = '';

beforeAll(async () => {
  const ca = await generateEd25519Keypair();
  await setupIntegration({ caPublicKeyB64Url: await exportPublicKeyB64Url(ca.publicKey) });

  const anchorKeys = await generateEd25519Keypair();
  const anchorPubB64Url = await exportPublicKeyB64Url(anchorKeys.publicKey);
  const anchorPubB64Std = await exportPublicKeyB64Std(anchorKeys.publicKey);
  const anchor = freshNode();
  anchorId = await uriNodeId(anchor.uri);
  const now = Math.floor(Date.now() / 1000);
  await registerNode(anchorId, anchor.uri, {
    certificate: await makeCertificate({
      caPrivateKey: ca.privateKey,
      node_id: anchorId,
      uri: anchor.uri,
      publicKeyB64Url: anchorPubB64Url,
      issuedAt: now - 60,
      expiresAt: now + 3600,
    }),
    vnodes: [
      {
        vnode_id: await deriveVNodeID(anchorId, 0),
        index: 0,
        proof: await makeVNodeProof({
          anchorPrivateKey: anchorKeys.privateKey,
          anchorPublicKeyB64Std: anchorPubB64Std,
          vnode_id: await deriveVNodeID(anchorId, 0),
          anchor_id: anchorId,
          index: 0,
          issuedAt: now - 60,
          expiresAt: now + 3600,
        }),
      },
    ],
  });
  vnodeId = await deriveVNodeID(anchorId, 0);
});

describe('POST /tracker/nodes/:node_id/heartbeat', () => {
  it('rejects a malformed node_id', async () => {
    const res = await postJson('/tracker/nodes/not-hex/heartbeat', {});
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown node', async () => {
    const { node_id } = freshNode();
    const res = await postJson(`/tracker/nodes/${node_id}/heartbeat`, {});
    expect(res.status).toBe(404);
    expect(((await res.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('NotFound');
  });

  it('acknowledges an anchor heartbeat and persists ring state', async () => {
    const res = await postJson(`/tracker/nodes/${anchorId}/heartbeat`, {
      status: 'ACTIVE',
      successor_id: vnodeId,
      uptime_seconds: 42,
      successor_list: [vnodeId],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { acknowledged: boolean; tracker_time: string };
    expect(body.acknowledged).toBe(true);
    expect(Number.isNaN(Date.parse(body.tracker_time))).toBe(false);

    const record = (await (await api(`/tracker/nodes/${anchorId}`, { headers: adminHeaders() })).json()) as {
      successor_id: string | null;
      uptime_seconds: number | null;
      report_count: number;
    };
    expect(record.successor_id).toBe(vnodeId);
    expect(record.uptime_seconds).toBe(42);
    expect(record.report_count).toBeGreaterThanOrEqual(1);
  });

  it('acknowledges a direct vnode heartbeat', async () => {
    const res = await postJson(`/tracker/nodes/${vnodeId}/heartbeat`, { status: 'ACTIVE', uptime_seconds: 7 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { acknowledged: boolean }).acknowledged).toBe(true);
  });

  it('applies batched vnode heartbeats piggybacked on the anchor heartbeat', async () => {
    const res = await postJson(`/tracker/nodes/${anchorId}/heartbeat`, {
      status: 'ACTIVE',
      vnode_heartbeats: [{ vnode_id: vnodeId, status: 'ACTIVE', uptime_seconds: 9 }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      acknowledged: boolean;
      vnodes: { updated: number; errors: unknown[] };
    };
    expect(body.acknowledged).toBe(true);
    expect(body.vnodes.updated).toBe(1);
    expect(body.vnodes.errors).toEqual([]);
  });

  it('reports per-item errors for vnodes the anchor does not own', async () => {
    const { node_id: stranger } = freshNode();
    const res = await postJson(`/tracker/nodes/${anchorId}/heartbeat`, {
      vnode_heartbeats: [{ vnode_id: stranger, status: 'ACTIVE' }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vnodes: { updated: number; errors: { vnode_id: string; code: string }[] } };
    expect(body.vnodes.updated).toBe(0);
    expect(body.vnodes.errors).toEqual([{ vnode_id: stranger, code: 'UNKNOWN_VNODE' }]);
  });

  it('rejects a non-array vnode batch and an over-limit batch', async () => {
    const notArray = await postJson(`/tracker/nodes/${anchorId}/heartbeat`, { vnode_heartbeats: 'nope' });
    expect(notArray.status).toBe(400);

    const oversized = await postJson(`/tracker/nodes/${anchorId}/heartbeat`, {
      vnode_heartbeats: Array.from({ length: 9 }, () => ({ vnode_id: vnodeId })),
    });
    expect(oversized.status).toBe(400);
  });

  it('exposes the vnode as a logical node record to admins', async () => {
    const res = await api(`/tracker/nodes/${vnodeId}`, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const record = (await res.json()) as { is_vnode: boolean; anchor_id: string; node_id: string };
    expect(record.node_id).toBe(vnodeId);
    expect(record.is_vnode).toBe(true);
    expect(record.anchor_id).toBe(anchorId);
  });

  it('returns 404 for unauthenticated vnode reads', async () => {
    const res = await api(`/tracker/nodes/${vnodeId}`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { Exception: { Type: string } }).Exception.Type).toBe('NotFound');
  });

  it('rejects an uppercase node_id on heartbeat', async () => {
    const res = await postJson(`/tracker/nodes/${'D'.repeat(40)}/heartbeat`, {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string } }).Exception.Type).toBe('BadRequest');
  });

  it('omits the vnodes key for an empty vnode batch', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri);
    const res = await postJson(`/tracker/nodes/${node_id}/heartbeat`, {
      status: 'ACTIVE',
      vnode_heartbeats: [],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { acknowledged: boolean; vnodes?: unknown };
    expect(body.acknowledged).toBe(true);
    expect('vnodes' in body).toBe(false);
  });

  it('reports INVALID_REQUEST for malformed vnode_ids in a batch', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri);
    const res = await postJson(`/tracker/nodes/${node_id}/heartbeat`, {
      vnode_heartbeats: [{ vnode_id: 'not-hex', status: 'ACTIVE' }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vnodes: { updated: number; errors: { vnode_id: string; code: string }[] } };
    expect(body.vnodes.updated).toBe(0);
    expect(body.vnodes.errors).toEqual([{ vnode_id: 'not-hex', code: 'INVALID_REQUEST' }]);
  });

  it('rejects out-of-range heartbeat fields with 400', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri);
    const cases: Record<string, unknown>[] = [
      { finger_table_coverage: 2 },
      { uptime_seconds: -1 },
      { successor_list: ['not-hex'] },
      { status: 'x'.repeat(65) },
    ];
    for (const patch of cases) {
      const res = await postJson(`/tracker/nodes/${node_id}/heartbeat`, patch);
      expect(res.status, JSON.stringify(patch)).toBe(400);
      expect(((await res.json()) as { Exception: { Type: string } }).Exception.Type).toBe('BadRequest');
    }
  });

  it('persists full ring state across heartbeats', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri);
    const res = await postJson(`/tracker/nodes/${node_id}/heartbeat`, {
      status: 'ACTIVE',
      successor_id: node_id,
      predecessor_id: node_id,
      successor_list: [node_id],
      predecessor_list: [node_id],
      finger_nodes: [node_id],
      rtt_samples: { [node_id]: 12.5 },
      maintenance_mode: 'ACTIVE_MAINTENANCE',
      region: 'hb-region',
      cache_hits: 3,
      cache_misses: 1,
      cache_size: 4,
    });
    expect(res.status).toBe(200);

    const record = (await (
      await api(`/tracker/nodes/${node_id}`, { headers: adminHeaders() })
    ).json()) as {
      successor_id: string | null;
      predecessor_id: string | null;
      successor_list: string[] | null;
      predecessor_list: string[] | null;
      finger_nodes: string[] | null;
      rtt_samples: Record<string, number> | null;
      maintenance_mode: string | null;
      region: string | null;
      cache_hits: number | null;
      cache_misses: number | null;
      cache_size: number | null;
    };
    expect(record.successor_id).toBe(node_id);
    expect(record.predecessor_id).toBe(node_id);
    expect(record.successor_list).toEqual([node_id]);
    expect(record.predecessor_list).toEqual([node_id]);
    expect(record.finger_nodes).toEqual([node_id]);
    expect(record.rtt_samples).toEqual({ [node_id]: 12.5 });
    expect(record.maintenance_mode).toBe('ACTIVE_MAINTENANCE');
    expect(record.region).toBe('hb-region');
    expect(record.cache_hits).toBe(3);
    expect(record.cache_misses).toBe(1);
    expect(record.cache_size).toBe(4);
  });

  it('rate-limits heartbeats after 10 requests per minute', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri);
    for (let i = 0; i < 9; i += 1) {
      expect((await postJson(`/tracker/nodes/${node_id}/heartbeat`, {})).status).toBe(200);
    }
    const limited = await postJson(`/tracker/nodes/${node_id}/heartbeat`, {});
    expect(limited.status).toBe(429);
    expect(((await limited.json()) as { Exception: { Type: string } }).Exception.Type).toBe('RateLimited');
  });
});
