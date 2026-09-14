import { beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, api, freshNode, postJson, registerNode, setupIntegration } from '../helpers/setup';

const ids: string[] = [];

beforeAll(async () => {
  await setupIntegration();
  const first = freshNode();
  const second = freshNode();
  const third = freshNode();
  await registerNode(first.node_id, first.uri, { region: 'r1' });
  await registerNode(second.node_id, second.uri, { region: 'r1' });
  await registerNode(third.node_id, third.uri, { region: 'r2' });
  ids.push(first.node_id, second.node_id, third.node_id);
  await postJson(`/tracker/nodes/${third.node_id}/heartbeat`, { status: 'LEAVING' });
});

function maskedValues(record: Record<string, unknown>): [string, unknown][] {
  return Object.entries(record).filter(([key]) => key !== 'node_id');
}

describe('GET /tracker/nodes', () => {
  it('masks every field except node_id for unauthenticated callers', async () => {
    const res = await api('/tracker/nodes');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nodes: Record<string, unknown>[]; total: number; limit: number; offset: number };
    expect(body.total).toBe(3);
    expect(body.nodes).toHaveLength(3);
    for (const node of body.nodes) {
      expect(typeof node.node_id).toBe('string');
      for (const [key, value] of maskedValues(node)) {
        expect(value, `expected ${key} to be masked`).toBeNull();
      }
    }
  });

  it('returns full records for admin callers', async () => {
    const res = await api('/tracker/nodes', { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nodes: Record<string, unknown>[]; total: number };
    expect(body.total).toBe(3);
    const byId = new Map(body.nodes.map((node) => [node.node_id as string, node]));
    expect(byId.get(ids[0])?.uri).toContain('https://');
    expect(byId.get(ids[0])?.status).toBe('ACTIVE');
    expect(byId.get(ids[0])?.region).toBe('r1');
    expect(byId.get(ids[2])?.status).toBe('LEAVING');
  });

  it('filters by status', async () => {
    const res = await api('/tracker/nodes?status=LEAVING', { headers: adminHeaders() });
    const body = (await res.json()) as { nodes: { node_id: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.nodes[0]?.node_id).toBe(ids[2]);
  });

  it('filters by region', async () => {
    const res = await api('/tracker/nodes?region=r1', { headers: adminHeaders() });
    const body = (await res.json()) as { nodes: unknown[]; total: number };
    expect(body.total).toBe(2);
    expect(body.nodes).toHaveLength(2);
  });

  it('paginates with limit and offset', async () => {
    const page = (await (await api('/tracker/nodes?limit=2&offset=0', { headers: adminHeaders() })).json()) as {
      nodes: unknown[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(page.nodes).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(0);
    const rest = (await (await api('/tracker/nodes?limit=2&offset=2', { headers: adminHeaders() })).json()) as {
      nodes: unknown[];
      offset: number;
    };
    expect(rest.nodes).toHaveLength(1);
    expect(rest.offset).toBe(2);
  });

  it('supports include_vnodes for admin callers', async () => {
    const res = await api('/tracker/nodes?include_vnodes=true', { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nodes: unknown[]; total: number };
    expect(body.total).toBe(3);
  });
});
