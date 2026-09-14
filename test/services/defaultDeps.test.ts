import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import { CrlService } from '@chord-dht-tracker/backend-services/crl';
import { NodeService } from '@chord-dht-tracker/backend-services/node';
import { StatsService } from '@chord-dht-tracker/backend-services/stats';
import { createD1, createStmt } from '../mocks/d1';
import { createEnv } from '../mocks/env';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('service default dependency factories', () => {
  it('NodeService surfaces unbound CertService', async () => {
    const db = createD1();
    const service = new NodeService(createEnv(db) as unknown as ServiceEnv);
    await expect(
      service.registerAnchorOrVnode({ node_id: 'a'.repeat(40), uri: 'https://node.example.com' }),
    ).rejects.toThrow('CertService is not bound');
  });

  it('NodeService lists nodes on default DAOs and surfaces unbound collaborators', async () => {
    const db = createD1(
      createStmt({ allResults: [] }),
      createStmt({ firstResult: { count: 0 } }),
      createStmt({ firstResult: null }),
      createStmt({ firstResult: null }),
      createStmt({ changes: 1 }),
    );
    const service = new NodeService(createEnv(db) as unknown as ServiceEnv);
    await expect(service.listNodes({})).resolves.toEqual({ nodes: [], total: 0, limit: 50, offset: 0 });
    // Anchor miss as admin reaches the default vnodeDAO factory, then 404s.
    await expect(service.getById('a'.repeat(40), true)).rejects.toThrow('not found');
    // Anchor hit with batched vnodes reaches the default (unbound) vnodeService factory.
    await expect(service.heartbeat('a'.repeat(40), { vnode_heartbeats: [{ vnode_id: 'b'.repeat(40) }] })).rejects.toThrow(
      'VNodeService is not bound',
    );
  });

  it('CrlService reads through the default DAO and surfaces unbound CertService', async () => {
    const db = createD1(createStmt({ firstResult: null }));
    const service = new CrlService(createEnv(db) as unknown as ServiceEnv);
    await expect(service.getLatest()).rejects.toThrow('No CRL available');
    await expect(
      service.upload({ version: 1, updated_at: 1_700_000_000, revoked_node_ids: [], signature: 'sig' }),
    ).rejects.toThrow('CertService is not bound');
  });

  it('StatsService runs on default DAOs against D1', async () => {
    const db = createD1(
      createStmt({ allResults: [] }),
      createStmt({ allResults: [] }),
      createStmt({ changes: 1 }),
      createStmt({ firstResult: { value: '2026-09-14T11:00:00.000Z' } }),
    );
    const service = new StatsService(createEnv(db) as unknown as ServiceEnv);
    const stats = await service.getStats(new Date('2026-09-14T12:00:00.000Z'));
    expect(stats.anchor_nodes.total_nodes).toBe(0);
    expect(typeof stats.tracker_uptime_seconds).toBe('number');
  });
});
