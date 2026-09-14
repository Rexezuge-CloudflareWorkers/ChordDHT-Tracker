import { beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, api, freshNode, postJson, registerNode, setupIntegration } from '../helpers/setup';

beforeAll(async () => {
  await setupIntegration();
});

describe('management edge cases', () => {
  it('returns 404 for unknown routes (SPA shell disabled)', async () => {
    expect((await api('/tracker/nope')).status).toBe(404);
    expect((await api('/nope')).status).toBe(404);
  });

  it('rejects malformed node_ids with 400 across routes', async () => {
    expect((await api('/tracker/nodes/xyz')).status).toBe(400);
    expect((await api('/tracker/nodes/xyz', { method: 'DELETE' })).status).toBe(400);
    expect((await postJson('/tracker/nodes/xyz/heartbeat', {})).status).toBe(400);
    expect((await postJson('/tracker/nodes', { node_id: 'xyz', uri: 'https://x.example' })).status).toBe(400);
  });

  it('returns 404 for well-formed but unknown node_ids', async () => {
    const { node_id } = freshNode();
    expect((await api(`/tracker/nodes/${node_id}`)).status).toBe(404);
    expect((await api(`/tracker/nodes/${node_id}`, { method: 'DELETE' })).status).toBe(404);
    const heartbeat = await postJson(`/tracker/nodes/${node_id}/heartbeat`, {});
    expect(heartbeat.status).toBe(404);
    expect(((await heartbeat.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('NotFound');
  });

  it('rejects malformed JSON registration bodies', async () => {
    const res = await postJson('/tracker/nodes', '{oops');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('BadRequest');
  });

  it('rate-limits a node after 10 requests per minute', async () => {
    const { node_id, uri } = freshNode();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await postJson('/tracker/nodes', { node_id, uri })).status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
    const body = (await (
      await postJson('/tracker/nodes', { node_id, uri })
    ).json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('RateLimited');
  });

  it('masks unauthenticated records to node_id-only on single reads and lists', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri, { region: 'edge' });

    const single = (await (await api(`/tracker/nodes/${node_id}`)).json()) as Record<string, unknown>;
    expect(single.node_id).toBe(node_id);
    for (const [key, value] of Object.entries(single)) {
      if (key === 'node_id') continue;
      expect(value, `single: expected ${key} masked`).toBeNull();
    }

    const list = (await (await api('/tracker/nodes')).json()) as { nodes: Record<string, unknown>[] };
    const entry = list.nodes.find((node) => node.node_id === node_id);
    expect(entry).toBeDefined();
    for (const [key, value] of Object.entries(entry!)) {
      if (key === 'node_id') continue;
      expect(value, `list: expected ${key} masked`).toBeNull();
    }

    const full = (await (await api(`/tracker/nodes/${node_id}`, { headers: adminHeaders() })).json()) as {
      uri: string;
    };
    expect(full.uri).toBe(uri);
  });
});
