import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CryptoService } from '@chord-dht-tracker/backend-data/crypto';
import type { VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import { BadRequestError } from '@chord-dht-tracker/backend-errors';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import { VNodeService } from '@chord-dht-tracker/backend-services/vnode';
import type { VNodeProof } from '@chord-dht-tracker/shared';

const ANCHOR_ID = 'a'.repeat(40);
const VNODE_ID = 'b'.repeat(40);
const NOW_UNIX = 1_700_000_000;

function setup(vars: Record<string, string> = {}) {
  const vnodeDAO = {
    upsert: vi.fn().mockResolvedValue(undefined),
    checkCollision: vi.fn().mockResolvedValue(false),
    heartbeatBatched: vi.fn().mockResolvedValue({ updated: 1, errors: [] }),
  };
  const crypto = {
    deriveVNodeID: vi.fn().mockResolvedValue(VNODE_ID),
    verifyVNodeProof: vi.fn().mockResolvedValue(true),
  };
  const config = AppConfiguration.fromEnv({ MAX_VNODES_PER_ANCHOR: '8', ...vars });
  const service = new VNodeService({ DB: {} } as unknown as ServiceEnv, {
    vnodeDAO: () => Promise.resolve(vnodeDAO as unknown as VNodeDAO),
    crypto: crypto as unknown as CryptoService,
    config,
  });
  return { service, vnodeDAO, crypto };
}

function proof(overrides: Partial<VNodeProof> = {}): VNodeProof {
  return {
    vnode_id: VNODE_ID,
    anchor_id: ANCHOR_ID,
    index: 0,
    issued_at: NOW_UNIX - 60,
    expires_at: NOW_UNIX + 3600,
    anchor_pub: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    signature: 'A'.repeat(86) + '==',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VNodeService identity', () => {
  it('delegates deriveVNodeID to crypto', async () => {
    const { service, crypto } = setup();
    await expect(service.deriveVNodeID(ANCHOR_ID, 0)).resolves.toBe(VNODE_ID);
    expect(crypto.deriveVNodeID).toHaveBeenCalledWith(ANCHOR_ID, 0);
  });

  it('delegates verifyProof to crypto', async () => {
    const { service, crypto } = setup();
    const input = proof();
    await expect(service.verifyProof(input, 'anchor-pub')).resolves.toBe(true);
    expect(crypto.verifyVNodeProof).toHaveBeenCalledWith(input, 'anchor-pub');
  });

  it('upserts through the DAO', async () => {
    const { service, vnodeDAO } = setup();
    const input = { vnodeId: VNODE_ID, anchorId: ANCHOR_ID, vnodeIndex: 0, proofJson: '{}', nowUnix: NOW_UNIX };
    await service.upsert(input);
    expect(vnodeDAO.upsert).toHaveBeenCalledWith(input);
  });
});

describe('VNodeService.validateInlineVnodes', () => {
  it('accepts valid entries and returns the count', async () => {
    const { service, vnodeDAO } = setup();
    const count = await service.validateInlineVnodes(ANCHOR_ID, 'anchor-pub', [{ vnode_id: VNODE_ID, index: 0, proof: proof() }], NOW_UNIX);
    expect(count).toBe(1);
    expect(vnodeDAO.upsert).toHaveBeenCalledTimes(1);
  });

  it('skips invalid entries without failing', async () => {
    const { service, vnodeDAO } = setup();
    const count = await service.validateInlineVnodes(
      ANCHOR_ID,
      'anchor-pub',
      [
        { vnode_id: 'not-hex', index: 99 },
        { vnode_id: VNODE_ID },
        { vnode_id: VNODE_ID, index: 0 },
        { vnode_id: VNODE_ID, index: 0, proof: proof() },
      ],
      NOW_UNIX,
    );
    expect(count).toBe(1);
    expect(vnodeDAO.upsert).toHaveBeenCalledTimes(1);
  });

  it('skips entries with failing proofs or collisions', async () => {
    const { service, vnodeDAO, crypto } = setup();
    crypto.verifyVNodeProof.mockResolvedValueOnce(false);
    vnodeDAO.checkCollision.mockResolvedValue(true);
    const count = await service.validateInlineVnodes(
      ANCHOR_ID,
      'anchor-pub',
      [
        { vnode_id: VNODE_ID, index: 0, proof: proof() },
        { vnode_id: 'c'.repeat(40), index: 1, proof: proof({ vnode_id: 'c'.repeat(40), index: 1 }) },
      ],
      NOW_UNIX,
    );
    expect(count).toBe(0);
    expect(vnodeDAO.upsert).not.toHaveBeenCalled();
  });

  it('enforces the max-vnodes limit', async () => {
    const { service, vnodeDAO } = setup({ MAX_VNODES_PER_ANCHOR: '1' });
    const count = await service.validateInlineVnodes(
      ANCHOR_ID,
      'anchor-pub',
      [
        { vnode_id: VNODE_ID, index: 0, proof: proof() },
        { vnode_id: 'c'.repeat(40), index: 1, proof: proof({ vnode_id: 'c'.repeat(40), index: 1 }) },
      ],
      NOW_UNIX,
    );
    expect(count).toBe(1);
    expect(vnodeDAO.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('VNodeService.applyBatchedHeartbeats', () => {
  it('delegates batches to the DAO', async () => {
    const { service, vnodeDAO } = setup();
    const batch = [{ vnode_id: VNODE_ID, status: 'ACTIVE' }];
    await expect(service.applyBatchedHeartbeats(ANCHOR_ID, batch, NOW_UNIX)).resolves.toEqual({ updated: 1, errors: [] });
    expect(vnodeDAO.heartbeatBatched).toHaveBeenCalledWith(ANCHOR_ID, batch, NOW_UNIX);
  });

  it('rejects non-array batches', async () => {
    const { service } = setup();
    await expect(service.applyBatchedHeartbeats(ANCHOR_ID, { vnode_id: VNODE_ID }, NOW_UNIX)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('rejects batches over the limit', async () => {
    const { service } = setup({ MAX_VNODES_PER_ANCHOR: '1' });
    await expect(
      service.applyBatchedHeartbeats(ANCHOR_ID, [{ vnode_id: VNODE_ID }, { vnode_id: 'c'.repeat(40) }], NOW_UNIX),
    ).rejects.toThrow(/exceeds limit/);
  });
});
