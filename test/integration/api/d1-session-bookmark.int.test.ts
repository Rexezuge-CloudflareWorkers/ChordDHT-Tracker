import { beforeAll, describe, expect, it } from 'vitest';
import { api, freshNode, postJson, registerNode, setupIntegration } from '../helpers/setup';

beforeAll(async () => {
  await setupIntegration();
});

describe('x-d1-bookmark session header', () => {
  it('exposes the bookmark header on tracker reads', async () => {
    const res = await api('/tracker/nodes');
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Expose-Headers')).toBe('x-d1-bookmark');
  });

  it('exposes the bookmark header on tracker writes', async () => {
    const { node_id, uri } = freshNode();
    const res = await postJson('/tracker/nodes', { node_id, uri });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Expose-Headers')).toBe('x-d1-bookmark');
  });

  it('round-trips a returned bookmark on the next request', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri);
    const first = await api(`/tracker/nodes/${node_id}`);
    expect(first.status).toBe(200);
    const bookmark = first.headers.get('x-d1-bookmark');
    const second = await api(`/tracker/nodes/${node_id}`, {
      headers: bookmark ? { 'x-d1-bookmark': bookmark } : {},
    });
    expect(second.status).toBe(200);
    const body = (await second.json()) as { node_id: string };
    expect(body.node_id).toBe(node_id);
  });
});
