import type { Context } from 'hono';

type RouteContext = Context<{ Bindings: Env }>;

abstract class IBaseRoute {
  async handle(c: RouteContext): Promise<Response> {
    try {
      return await this.handleRequest(c);
    } catch (error: unknown) {
      return this.toErrorResponse(error, c);
    }
  }

  protected abstract handleRequest(c: RouteContext): Promise<Response>;

  protected toErrorResponse(error: unknown, c: RouteContext): Response {
    console.error('Caught error during request handling:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred', detail: {} } }, 500);
  }
}

export { IBaseRoute };
export type { RouteContext };
