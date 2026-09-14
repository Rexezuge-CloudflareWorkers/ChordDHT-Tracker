import { beforeAll, describe, expect, it } from 'vitest';
import { api, freshNode, registerNode, setupIntegration } from '../helpers/setup';

const ids: string[] = [];

beforeAll(async () => {
  await setupIntegration();
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
});
