import { describe, expect, it } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1 } from '../mocks/d1';
import { createEnv } from '../mocks/env';

interface PolicyResponse {
  max_vnodes_per_anchor: number;
  min_anchor_ratio: number;
}

describe('GET /tracker/policy', () => {
  it('returns default vnode policy values from env', async () => {
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(new Request('http://localhost/tracker/policy'), createEnv(createD1()), {} as ExecutionContext);

    expect(res.status).toBe(200);
    const body = (await res.json()) as PolicyResponse;
    expect(body).toEqual({
      max_vnodes_per_anchor: 8,
      min_anchor_ratio: 0.3,
    });
  });

  it('returns overridden vnode policy values from env', async () => {
    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/policy'),
      createEnv(createD1(), true, null, {
        MAX_VNODES_PER_ANCHOR: '16',
        MIN_ANCHOR_RATIO: '0.45',
      }),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as PolicyResponse;
    expect(body).toEqual({
      max_vnodes_per_anchor: 16,
      min_anchor_ratio: 0.45,
    });
  });
});
