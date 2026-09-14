import { beforeAll, describe, expect, it } from 'vitest';
import { api, freshNode, registerNode, setupIntegration } from '../helpers/setup';

beforeAll(async () => {
  await setupIntegration();
});

describe('GET /tracker/stable_base', () => {
  it('reports the configured stable base with zero live members initially', async () => {
    const res = await api('/tracker/stable_base');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stable_base_min_size: number;
      configured_count: number;
      live_count: number;
      degraded: boolean;
      emergency: boolean;
      emergency_threshold: number;
      stale_threshold_seconds: number;
      checked_at: string;
      members: { registered: boolean; live: boolean }[];
    };
    expect(body.stable_base_min_size).toBe(6);
    expect(body.configured_count).toBe(7);
    expect(body.live_count).toBe(0);
    expect(body.degraded).toBe(true);
    expect(body.emergency).toBe(true);
    expect(body.emergency_threshold).toBe(4);
    expect(body.stale_threshold_seconds).toBe(600);
    expect(body.members).toHaveLength(7);
    for (const member of body.members) {
      expect(member.registered).toBe(false);
      expect(member.live).toBe(false);
    }
    expect(Number.isNaN(Date.parse(body.checked_at))).toBe(false);
  });

  it('still reports zero live members after unrelated nodes register', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri);
    const body = (await (await api('/tracker/stable_base')).json()) as {
      configured_count: number;
      live_count: number;
    };
    expect(body.configured_count).toBe(7);
    expect(body.live_count).toBe(0);
  });
});
