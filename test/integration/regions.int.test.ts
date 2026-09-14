import { beforeAll, describe, expect, it } from 'vitest';
import { api, freshNode, registerNode, setupIntegration } from './helpers/setup';

beforeAll(async () => {
  await setupIntegration();
  const first = freshNode();
  const second = freshNode();
  const third = freshNode();
  const fourth = freshNode();
  await registerNode(first.node_id, first.uri, { region: 'us-east' });
  await registerNode(second.node_id, second.uri, { region: 'us-east' });
  await registerNode(third.node_id, third.uri, { region: 'eu-west' });
  await registerNode(fourth.node_id, fourth.uri);
});

describe('GET /tracker/regions', () => {
  it('counts nodes per region and skips nodes without one', async () => {
    const res = await api('/tracker/regions');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ regions: { 'us-east': 2, 'eu-west': 1 } });
  });
});
