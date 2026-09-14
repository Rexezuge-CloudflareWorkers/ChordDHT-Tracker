import { beforeAll, describe, expect, it } from 'vitest';
import { api, freshNode, registerNode, setupIntegration } from '../helpers/setup';
import type { IntegrationEnv } from '../helpers/setup';

const ids: string[] = [];
let testEnv: IntegrationEnv;

beforeAll(async () => {
  testEnv = await setupIntegration();
  for (let i = 0; i < 3; i += 1) {
    const { node_id, uri } = freshNode();
    ids.push(node_id);
    await registerNode(node_id, uri);
  }
});

describe('GET /tracker/nodes/seeds', () => {
  it('returns random seeds plus the ring size', async () => {
    const res = await api('/tracker/nodes/seeds?count=2');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      seeds: { node_id: string; uri: string }[];
      total_known: number;
      note: string;
    };
    expect(body.seeds).toHaveLength(2);
    for (const seed of body.seeds) {
      expect(ids).toContain(seed.node_id);
      expect(seed.uri.startsWith('https://')).toBe(true);
    }
    expect(body.total_known).toBe(3);
    expect(typeof body.note).toBe('string');
  });

  it('honours the exclude list', async () => {
    const res = await api(`/tracker/nodes/seeds?count=5&exclude=${ids[0]},${ids[1]}`);
    const body = (await res.json()) as { seeds: { node_id: string }[] };
    expect(body.seeds).toHaveLength(1);
    expect(body.seeds[0]?.node_id).toBe(ids[2]);
  });

  it('caps count at the available nodes', async () => {
    const res = await api('/tracker/nodes/seeds?count=100');
    const body = (await res.json()) as { seeds: unknown[] };
    expect(body.seeds).toHaveLength(3);
  });

  it('omits certificates when nodes have none', async () => {
    const res = await api('/tracker/nodes/seeds?include_cert=true');
    const body = (await res.json()) as { seeds: Record<string, unknown>[] };
    expect(body.seeds).toHaveLength(3);
    for (const seed of body.seeds) {
      expect('certificate' in seed).toBe(false);
    }
  });

  it('falls back to defaults and clamps count (0/negative/non-integer)', async () => {
    interface SeedsBody {
      seeds: unknown[];
      total_known: number;
    }
    const def = (await (await api('/tracker/nodes/seeds')).json()) as SeedsBody;
    expect(def.seeds).toHaveLength(3);
    expect(def.total_known).toBe(3);

    const zero = (await (await api('/tracker/nodes/seeds?count=0')).json()) as SeedsBody;
    expect(zero.seeds).toHaveLength(1);

    const negative = (await (await api('/tracker/nodes/seeds?count=-1')).json()) as SeedsBody;
    expect(negative.seeds).toHaveLength(1);

    const nan = (await (await api('/tracker/nodes/seeds?count=abc')).json()) as SeedsBody;
    expect(nan.seeds).toHaveLength(3);

    const float = (await (await api('/tracker/nodes/seeds?count=1.5')).json()) as SeedsBody;
    expect(float.seeds).toHaveLength(3);
  });

  it('ignores invalid exclude entries and empty exclude lists', async () => {
    const mixed = (await (await api(`/tracker/nodes/seeds?count=5&exclude=not-hex,${ids[0]}`)).json()) as {
      seeds: { node_id: string }[];
    };
    expect(mixed.seeds).toHaveLength(2);
    expect(mixed.seeds.map((seed) => seed.node_id)).not.toContain(ids[0]);

    const empty = (await (await api('/tracker/nodes/seeds?count=5&exclude=')).json()) as {
      seeds: unknown[];
    };
    expect(empty.seeds).toHaveLength(3);
  });

  it('omits certificates for include_cert=false and when the param is absent', async () => {
    for (const query of ['include_cert=false', '']) {
      const suffix = query ? `?${query}` : '?count=3';
      const path = query ? `/tracker/nodes/seeds?count=3&${query}` : `/tracker/nodes/seeds${suffix}`;
      const body = (await (await api(path)).json()) as { seeds: Record<string, unknown>[] };
      expect(body.seeds).toHaveLength(3);
      for (const seed of body.seeds) {
        expect('certificate' in seed).toBe(false);
      }
    }
  });

  it('excludes stale nodes from seeds while keeping them in total_known', async () => {
    const staleIso = new Date(Date.now() - 3600 * 1000).toISOString();
    await testEnv.DB.prepare('UPDATE nodes SET last_seen = ? WHERE node_id = ?').bind(staleIso, ids[0]).run();

    const body = (await (await api('/tracker/nodes/seeds?count=5')).json()) as {
      seeds: { node_id: string }[];
      total_known: number;
    };
    expect(body.total_known).toBe(3);
    expect(body.seeds.map((seed) => seed.node_id)).not.toContain(ids[0]);
    expect(body.seeds).toHaveLength(2);
  });
});
