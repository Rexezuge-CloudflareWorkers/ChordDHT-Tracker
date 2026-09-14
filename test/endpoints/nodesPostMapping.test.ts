import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { BadRequestError } from '@chord-dht-tracker/backend-errors';
import { NodesPostRoute } from '@/endpoints/tracker/nodes/POST';

const { registerAnchorOrVnode } = vi.hoisted(() => ({ registerAnchorOrVnode: vi.fn() }));

vi.mock('@chord-dht-tracker/backend-services/composition', () => ({
  Tokens: { NodeService: Symbol('test-NodeService') },
  createRequestScope: () => ({
    get: () => ({ registerAnchorOrVnode }),
  }),
}));

const env = { NODE_RATE_LIMITER: { limit: async () => ({ success: true }) } };

function app() {
  const hono = new Hono<{ Bindings: Env }>();
  hono.post('/tracker/nodes', (c) => new NodesPostRoute().handle(c));
  return hono;
}

function post(body: unknown) {
  return app().request(
    new Request('http://localhost/tracker/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    {},
    env as unknown as Env,
  );
}

describe('NodesPostRoute service-error mapping', () => {
  it('maps ID_COLLISION to 409 Conflict', async () => {
    registerAnchorOrVnode.mockRejectedValueOnce(new BadRequestError('ID_COLLISION: vnode_id collides'));
    const res = await post({ node_id: 'a'.repeat(40), uri: 'https://node.example.com' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('Conflict');
    expect(body.Exception.Message).toBe('vnode_id collides');
  });

  it('passes other BadRequestErrors through as 400', async () => {
    registerAnchorOrVnode.mockRejectedValueOnce(new BadRequestError('Anchor node not registered'));
    const res = await post({ node_id: 'a'.repeat(40), uri: 'https://node.example.com' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { Exception: { Type: string; Message: string } };
    expect(body.Exception.Type).toBe('BadRequest');
  });
});
