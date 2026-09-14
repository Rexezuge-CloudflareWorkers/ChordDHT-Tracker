import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';

type Mode = 'plain' | 'redirect' | 'raw' | 'boom';

interface HarnessRequest extends IRequest {
  mode?: Mode;
}

interface HarnessResponse extends IResponse {
  hello: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface HarnessEnv extends IEnv {}

class HarnessRoute extends IBaseRoute<HarnessRequest, HarnessResponse, HarnessEnv> {
  protected async handleRequest(
    request: HarnessRequest,
    _env: HarnessEnv,
    _cxt: RouteContext<HarnessEnv>,
  ): Promise<HarnessResponse> {
    if (request.mode === 'boom') throw new Error('boom');
    if (request.mode === 'redirect') return { statusCode: 301, headers: { location: '/elsewhere' } };
    if (request.mode === 'raw') return { rawBody: 'raw-payload', headers: { 'content-type': 'text/plain' } };
    return { hello: 'world' };
  }
}

function app() {
  const hono = new Hono<{ Bindings: Env }>();
  hono.all('/harness', (c) => new HarnessRoute().handle(c));
  return hono;
}

describe('IBaseRoute response mapping', () => {
  it('serializes plain objects as JSON', async () => {
    const res = await app().request(new Request('http://localhost/harness', { method: 'POST', body: '{}' }), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: 'world' });
  });

  it('maps ExtendedResponse redirects to empty 3xx bodies with headers', async () => {
    const res = await app().request(
      new Request('http://localhost/harness', { method: 'POST', body: JSON.stringify({ mode: 'redirect' }) }),
      {},
    );
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/elsewhere');
  });

  it('maps ExtendedResponse raw bodies with headers', async () => {
    const res = await app().request(
      new Request('http://localhost/harness', { method: 'POST', body: JSON.stringify({ mode: 'raw' }) }),
      {},
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(await res.text()).toBe('raw-payload');
  });

  it('masks untyped errors as internal errors', async () => {
    const res = await app().request(
      new Request('http://localhost/harness', { method: 'POST', body: JSON.stringify({ mode: 'boom' }) }),
      {},
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { Exception: { Type: string } };
    expect(body.Exception.Type).toBe('InternalServerError');
  });
});
