import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import { BadRequestError, NotFoundError } from '@chord-dht-tracker/backend-errors';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type { CertService } from '@chord-dht-tracker/backend-services/auth';
import { NodeService } from '@chord-dht-tracker/backend-services/node';
import type { VNodeService } from '@chord-dht-tracker/backend-services/vnode';
import type { TrackerNodeRecord } from '@chord-dht-tracker/shared';

const ANCHOR = 'a'.repeat(40);
const VNODE = 'b'.repeat(40);
const URI = 'https://node1.example.com';

const anchorRow = {
  node_id: ANCHOR,
  uri: URI,
  status: 'ACTIVE',
  joined_at: '2026-05-28T00:00:00.000Z',
  last_seen: '2026-05-28T06:00:00.000Z',
  report_count: 10,
} as unknown as TrackerNodeRecord;

function setup(vars: Record<string, string> = {}) {
  const nodeDAO = {
    registerAnchor: vi.fn().mockResolvedValue(undefined),
    countAll: vi.fn().mockResolvedValue(1),
    evictOverLimit: vi.fn().mockResolvedValue(undefined),
    getAnchorCertJson: vi.fn().mockResolvedValue(null),
    deleteAnchor: vi.fn().mockResolvedValue(0),
    setVnodeCount: vi.fn().mockResolvedValue(undefined),
    listAnchors: vi.fn().mockResolvedValue([]),
    countAnchors: vi.fn().mockResolvedValue(0),
    findAnchorById: vi.fn().mockResolvedValue(null),
    heartbeatAnchor: vi.fn().mockResolvedValue(0),
    listSeeds: vi.fn().mockResolvedValue([]),
    regionCounts: vi.fn().mockResolvedValue({}),
  };
  const vnodeDAO = {
    checkCollision: vi.fn().mockResolvedValue(false),
    upsert: vi.fn().mockResolvedValue(undefined),
    findAnchorIdByVnodeId: vi.fn().mockResolvedValue(null),
    deleteById: vi.fn().mockResolvedValue(0),
    countByAnchor: vi.fn().mockResolvedValue(0),
    deleteByAnchor: vi.fn().mockResolvedValue(undefined),
    heartbeatDirect: vi.fn().mockResolvedValue(0),
    listByAnchor: vi.fn().mockResolvedValue([]),
    listLogicalByAnchors: vi.fn().mockResolvedValue([]),
    findLogicalById: vi.fn().mockResolvedValue(null),
  };
  const certService = {
    getCAPublicKey: vi.fn().mockResolvedValue(null),
    verifyCertificate: vi.fn(),
    normalizeURI: vi.fn((uri: string) => uri),
    hashURI: vi.fn().mockResolvedValue(ANCHOR),
  };
  const vnodeService = {
    verifyProof: vi.fn().mockResolvedValue(true),
    validateInlineVnodes: vi.fn().mockResolvedValue(0),
    applyBatchedHeartbeats: vi.fn().mockResolvedValue({ updated: 0, errors: [] }),
  };
  const crlDAO = {
    getLatest: vi.fn().mockResolvedValue(null),
    getLatestVersion: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue(undefined),
  };
  const config = AppConfiguration.fromEnv({
    MAX_NODES: '1000',
    STALE_THRESHOLD_SECONDS: '600',
    MAX_VNODES_PER_ANCHOR: '8',
    ...vars,
  });
  const service = new NodeService({ DB: {} }, {
    nodeDAO: () => Promise.resolve(nodeDAO as unknown as NodeDAO),
    vnodeDAO: () => Promise.resolve(vnodeDAO as unknown as VNodeDAO),
    certService: () => Promise.resolve(certService as unknown as CertService),
    vnodeService: () => Promise.resolve(vnodeService as unknown as VNodeService),
    crlDAO: () => Promise.resolve(crlDAO as unknown as import('@chord-dht-tracker/backend-data/dao').CrlDAO),
    config,
  });
  return { service, nodeDAO, vnodeDAO, certService, vnodeService, crlDAO };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NodeService registration', () => {
  it('registers an anchor and returns the known count', async () => {
    const { service, nodeDAO } = setup();

    const result = await service.registerAnchorOrVnode({ node_id: ANCHOR, uri: URI, region: 'iad' });

    expect(result).toEqual({
      registered: true,
      region: 'iad',
      known_nodes_count: 1,
      message: 'Node registered successfully',
    });
    expect(nodeDAO.registerAnchor).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: ANCHOR, uri: URI, region: 'iad' }),
    );
    expect(nodeDAO.evictOverLimit).toHaveBeenCalledWith(1000);
    expect(nodeDAO.countAll).toHaveBeenCalled();
  });

  it('rejects malformed node ids and non-https uris', async () => {
    const { service } = setup();

    await expect(service.registerAnchorOrVnode({ node_id: 'short', uri: URI })).rejects.toThrow(BadRequestError);
    await expect(service.registerAnchorOrVnode({ node_id: ANCHOR, uri: 'http://plain.example.com' })).rejects.toThrow(
      BadRequestError,
    );
  });

  it('skips certificate verification when no CA key is configured', async () => {
    const { service, certService, nodeDAO } = setup();

    await service.registerAnchorOrVnode({ node_id: ANCHOR, uri: URI, certificate: { version: 1 } });

    expect(certService.verifyCertificate).not.toHaveBeenCalled();
    expect(nodeDAO.registerAnchor).toHaveBeenCalledWith(expect.objectContaining({ certJson: null }));
  });

  it('stores the verified certificate for anchor registration', async () => {
    const { service, certService, nodeDAO } = setup();
    certService.getCAPublicKey.mockResolvedValue({} as CryptoKey);
    const verified = { node_id: ANCHOR, public_key: 'anchor-pub', expires_at: 1999999999 };
    certService.verifyCertificate.mockResolvedValue(verified);

    await service.registerAnchorOrVnode({ node_id: ANCHOR, uri: URI, certificate: { version: 1 } });

    expect(nodeDAO.registerAnchor).toHaveBeenCalledWith(
      expect.objectContaining({ certJson: JSON.stringify(verified), certExpiresAt: 1999999999 }),
    );
  });

  it('rejects a certificate bound to a different node id', async () => {
    const { service, certService } = setup();
    certService.getCAPublicKey.mockResolvedValue({} as CryptoKey);
    certService.verifyCertificate.mockResolvedValue({ node_id: VNODE, public_key: 'pk', expires_at: 1 });

    await expect(
      service.registerAnchorOrVnode({ node_id: ANCHOR, uri: URI, certificate: { version: 1 } }),
    ).rejects.toThrow(BadRequestError);
  });

  it('registers a vnode against its anchor certificate', async () => {
    const { service, nodeDAO, vnodeDAO, certService, vnodeService } = setup();
    certService.getCAPublicKey.mockResolvedValue({} as CryptoKey);
    nodeDAO.getAnchorCertJson.mockResolvedValue(JSON.stringify({ public_key: 'anchor-pub' }));
    const proof = { vnode_id: VNODE, anchor_id: ANCHOR, index: 0 };

    const result = await service.registerAnchorOrVnode({
      node_id: VNODE,
      uri: URI,
      anchor_id: ANCHOR,
      vnode_proof: proof,
    });

    expect(result.registered).toBe(true);
    expect(vnodeService.verifyProof).toHaveBeenCalledWith(proof, 'anchor-pub');
    expect(vnodeDAO.checkCollision).toHaveBeenCalledWith(VNODE, ANCHOR);
    expect(vnodeDAO.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ vnodeId: VNODE, anchorId: ANCHOR, proofJson: JSON.stringify(proof) }),
    );
  });

  it('rejects vnode registration without a registered anchor', async () => {
    const { service, certService } = setup();
    certService.getCAPublicKey.mockResolvedValue({} as CryptoKey);

    await expect(
      service.registerAnchorOrVnode({ node_id: VNODE, uri: URI, anchor_id: ANCHOR, vnode_proof: {} }),
    ).rejects.toThrow(/register anchor first/);
  });

  it('rejects vnode registration with a bad proof signature', async () => {
    const { service, certService, nodeDAO, vnodeService } = setup();
    certService.getCAPublicKey.mockResolvedValue({} as CryptoKey);
    nodeDAO.getAnchorCertJson.mockResolvedValue(JSON.stringify({ public_key: 'anchor-pub' }));
    vnodeService.verifyProof.mockResolvedValue(false);

    await expect(
      service.registerAnchorOrVnode({ node_id: VNODE, uri: URI, anchor_id: ANCHOR, vnode_proof: {} }),
    ).rejects.toThrow(/signature verification failed/);
  });

  it('rejects colliding vnode ids', async () => {
    const { service, certService, nodeDAO, vnodeDAO } = setup();
    certService.getCAPublicKey.mockResolvedValue({} as CryptoKey);
    nodeDAO.getAnchorCertJson.mockResolvedValue(JSON.stringify({ public_key: 'anchor-pub' }));
    vnodeDAO.checkCollision.mockResolvedValue(true);
    const proof = { vnode_id: VNODE, anchor_id: ANCHOR, index: 0 };

    await expect(
      service.registerAnchorOrVnode({ node_id: VNODE, uri: URI, anchor_id: ANCHOR, vnode_proof: proof }),
    ).rejects.toThrow(/ID_COLLISION/);
  });

  it('counts validated inline vnodes on the anchor', async () => {
    const { service, certService, nodeDAO, vnodeService } = setup();
    certService.getCAPublicKey.mockResolvedValue({} as CryptoKey);
    certService.verifyCertificate.mockResolvedValue({ node_id: ANCHOR, public_key: 'anchor-pub', expires_at: 1 });
    vnodeService.validateInlineVnodes.mockResolvedValue(2);

    await service.registerAnchorOrVnode({
      node_id: ANCHOR,
      uri: URI,
      certificate: { version: 1 },
      vnodes: [{ vnode_id: VNODE }],
    });

    expect(vnodeService.validateInlineVnodes).toHaveBeenCalledWith(
      ANCHOR,
      'anchor-pub',
      [{ vnode_id: VNODE }],
      expect.any(Number),
    );
    expect(nodeDAO.setVnodeCount).toHaveBeenCalledWith(ANCHOR, 2);
  });
});

describe('NodeService deletion', () => {
  it('deletes an anchor and its vnodes', async () => {
    const { service, nodeDAO, vnodeDAO } = setup();
    nodeDAO.deleteAnchor.mockResolvedValue(1);

    await expect(service.deleteNode(ANCHOR)).resolves.toEqual({ deregistered: true, node_id: ANCHOR });
    expect(vnodeDAO.deleteByAnchor).toHaveBeenCalledWith(ANCHOR);
  });

  it('deletes a vnode and recounts the anchor', async () => {
    const { service, nodeDAO, vnodeDAO } = setup();
    nodeDAO.deleteAnchor.mockResolvedValue(0);
    vnodeDAO.findAnchorIdByVnodeId.mockResolvedValue(ANCHOR);
    vnodeDAO.deleteById.mockResolvedValue(1);
    vnodeDAO.countByAnchor.mockResolvedValue(2);

    await expect(service.deleteNode(VNODE)).resolves.toEqual({ deregistered: true, node_id: VNODE });
    expect(nodeDAO.setVnodeCount).toHaveBeenCalledWith(ANCHOR, 2);
  });

  it('reports unknown nodes and malformed ids', async () => {
    const { service } = setup();

    await expect(service.deleteNode(VNODE)).rejects.toThrow(NotFoundError);
    await expect(service.deleteNode('bad')).rejects.toThrow(BadRequestError);
  });
});

describe('NodeService reads', () => {
  it('lists nodes with clamped pagination', async () => {
    const { service, nodeDAO } = setup();
    nodeDAO.listAnchors.mockResolvedValue([anchorRow]);
    nodeDAO.countAnchors.mockResolvedValue(1);

    const result = await service.listNodes({ limit: 999, offset: -5 });

    expect(result.total).toBe(1);
    expect(result.limit).toBe(200);
    expect(result.offset).toBe(0);
    expect(result.nodes).toHaveLength(1);
  });

  it('redacts node records for anonymous callers', async () => {
    const { service, nodeDAO } = setup();
    nodeDAO.findAnchorById.mockResolvedValue(anchorRow);

    const node = await service.getById(ANCHOR, false);

    expect(node.node_id).toBe(ANCHOR);
    expect((node as { uri: unknown }).uri).toBeNull();
  });

  it('returns the full record for admins and resolves vnodes', async () => {
    const { service, nodeDAO, vnodeDAO } = setup();
    nodeDAO.findAnchorById.mockImplementation(async (id: string) => (id === ANCHOR ? anchorRow : null));
    vnodeDAO.findLogicalById.mockResolvedValue({ ...anchorRow, node_id: VNODE });

    const full = await service.getById(ANCHOR, true);
    expect((full as TrackerNodeRecord).uri).toBe(URI);

    const vnode = await service.getById(VNODE, true);
    expect(vnode.node_id).toBe(VNODE);
  });

  it('rejects malformed ids and reports missing nodes', async () => {
    const { service } = setup();

    await expect(service.getById('bad', false)).rejects.toThrow(BadRequestError);
    await expect(service.getById(VNODE, false)).rejects.toThrow(NotFoundError);
    await expect(service.getById(VNODE, true)).rejects.toThrow(NotFoundError);
  });

  it('returns seeds with the total known count', async () => {
    const { service, nodeDAO } = setup();
    nodeDAO.listSeeds.mockResolvedValue([{ node_id: ANCHOR, uri: URI }]);
    nodeDAO.countAll.mockResolvedValue(5);

    const result = await service.getSeeds({ count: 2 });

    expect(result.seeds).toHaveLength(1);
    expect(result.total_known).toBe(5);
    expect(typeof result.note).toBe('string');
    expect(nodeDAO.listSeeds).toHaveBeenCalledWith(expect.objectContaining({ count: 2 }));
  });

  it('returns region counts', async () => {
    const { service, nodeDAO } = setup();
    nodeDAO.regionCounts.mockResolvedValue({ iad: 2 });

    await expect(service.regionCounts()).resolves.toEqual({ regions: { iad: 2 } });
  });
});

describe('NodeService heartbeats', () => {
  it('acknowledges an anchor heartbeat without batches', async () => {
    const { service, nodeDAO, vnodeService } = setup();
    nodeDAO.heartbeatAnchor.mockResolvedValue(1);

    const result = await service.heartbeat(ANCHOR, { status: 'ACTIVE' });

    expect(result.acknowledged).toBe(true);
    expect(new Date(result.tracker_time).toISOString()).toBe(result.tracker_time);
    expect(result.vnodes).toBeUndefined();
    expect(vnodeService.applyBatchedHeartbeats).not.toHaveBeenCalled();
  });

  it('applies piggybacked vnode heartbeats', async () => {
    const { service, nodeDAO, vnodeService } = setup();
    nodeDAO.heartbeatAnchor.mockResolvedValue(1);
    vnodeService.applyBatchedHeartbeats.mockResolvedValue({ updated: 2, errors: [] });

    const batch = [{ vnode_id: VNODE, status: 'ACTIVE' }];
    const result = await service.heartbeat(ANCHOR, { vnode_heartbeats: batch } as never);

    expect(result.vnodes).toEqual({ updated: 2, errors: [] });
    expect(vnodeService.applyBatchedHeartbeats).toHaveBeenCalledWith(ANCHOR, batch, expect.any(Number));
  });

  it('falls through to direct vnode heartbeats', async () => {
    const { service, nodeDAO, vnodeDAO } = setup();
    nodeDAO.heartbeatAnchor.mockResolvedValue(0);
    vnodeDAO.heartbeatDirect.mockResolvedValue(1);

    const result = await service.heartbeat(VNODE, { status: 'ACTIVE' });

    expect(result.acknowledged).toBe(true);
    expect(vnodeDAO.heartbeatDirect).toHaveBeenCalledWith(VNODE, { status: 'ACTIVE' }, expect.any(Number));
  });

  it('rejects malformed ids and unknown nodes', async () => {
    const { service } = setup();

    await expect(service.heartbeat('bad', {})).rejects.toThrow(BadRequestError);
    await expect(service.heartbeat(VNODE, {})).rejects.toThrow(NotFoundError);
  });
});

describe('NodeService heartbeat CRL piggyback', () => {
  const CRL_JSON = JSON.stringify({
    version: 3,
    updated_at: 1780000000,
    revoked_node_ids: ['c'.repeat(40)],
    signature: 'sig',
  });

  it('reports crl_version 0 with no payload when no CRL is stored', async () => {
    const { service, nodeDAO, crlDAO } = setup();
    nodeDAO.heartbeatAnchor.mockResolvedValue(1);

    const result = await service.heartbeat(ANCHOR, { status: 'ACTIVE', crl_version: 0 });

    expect(result.crl_version).toBe(0);
    expect(result.crl).toBeUndefined();
    expect(crlDAO.getLatest).not.toHaveBeenCalled();
  });

  it('omits the inline payload when the request carries no crl_version', async () => {
    const { service, nodeDAO, crlDAO } = setup();
    nodeDAO.heartbeatAnchor.mockResolvedValue(1);
    crlDAO.getLatestVersion.mockResolvedValue(3);

    const result = await service.heartbeat(ANCHOR, { status: 'ACTIVE' });

    expect(result.crl_version).toBe(3);
    expect(result.crl).toBeUndefined();
    expect(crlDAO.getLatest).not.toHaveBeenCalled();
  });

  it('inlines the CRL when the client version is stale', async () => {
    const { service, nodeDAO, crlDAO } = setup();
    nodeDAO.heartbeatAnchor.mockResolvedValue(1);
    crlDAO.getLatestVersion.mockResolvedValue(3);
    crlDAO.getLatest.mockResolvedValue(CRL_JSON);

    const result = await service.heartbeat(ANCHOR, { status: 'ACTIVE', crl_version: 1 });

    expect(result.crl_version).toBe(3);
    expect(result.crl).toEqual(JSON.parse(CRL_JSON));
  });

  it('omits the inline payload when the client is up to date', async () => {
    const { service, nodeDAO, crlDAO } = setup();
    nodeDAO.heartbeatAnchor.mockResolvedValue(1);
    crlDAO.getLatestVersion.mockResolvedValue(3);

    const result = await service.heartbeat(ANCHOR, { status: 'ACTIVE', crl_version: 3 });

    expect(result.crl_version).toBe(3);
    expect(result.crl).toBeUndefined();
    expect(crlDAO.getLatest).not.toHaveBeenCalled();
  });

  it('still acknowledges the heartbeat when the CRL lookup fails', async () => {
    const { service, nodeDAO, crlDAO } = setup();
    nodeDAO.heartbeatAnchor.mockResolvedValue(1);
    crlDAO.getLatestVersion.mockRejectedValue(new Error('D1 unavailable'));

    const result = await service.heartbeat(ANCHOR, { status: 'ACTIVE', crl_version: 0 });

    expect(result.acknowledged).toBe(true);
    expect(result.crl_version).toBeUndefined();
    expect(result.crl).toBeUndefined();
  });
});
