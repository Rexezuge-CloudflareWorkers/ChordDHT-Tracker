import { beforeAll, describe, expect, it } from 'vitest';
import { api, setupIntegration } from '../helpers/setup';

beforeAll(async () => {
  await setupIntegration();
});

describe('GET /tracker/policy', () => {
  it('returns the vnode policy from worker vars', async () => {
    const res = await api('/tracker/policy');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      max_vnodes_per_anchor: 8,
      min_anchor_ratio: 0.2,
    });
  });
});
