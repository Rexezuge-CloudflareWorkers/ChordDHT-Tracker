import { BadRequestError, ConflictError, RateLimitedError } from '@chord-dht-tracker/backend-errors';
import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import type { RegisterNodeResult } from '@chord-dht-tracker/backend-services/node';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

class NodesPostRoute extends IBaseRoute<NodesPostRequest, NodesPostResponse, NodesPostEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Register a node (anchor or vnode)',
    responses: {
      '200': {
        description: 'Registration result',
      },
    },
  };

  protected async handleRequest(
    request: NodesPostRequest,
    env: NodesPostEnv,
    _cxt: RouteContext<NodesPostEnv>,
  ): Promise<NodesPostResponse> {
    const { node_id } = request;
    // Rate limit stays in the route (services own no rate limiting). It runs
    // before the service call so a rate-limited request with a bad cert
    // surfaces 429.
    const { success } = await env.NODE_RATE_LIMITER.limit({ key: node_id });
    if (!success) {
      throw new RateLimitedError('Rate limit exceeded for this node');
    }

    const scope = createRequestScope(env);
    const nodeService = scope.get(Tokens.NodeService);
    try {
      return await nodeService.registerAnchorOrVnode(request);
    } catch (error: unknown) {
      if (error instanceof BadRequestError) {
        const message = error.getErrorMessage();
        if (message.startsWith('ID_COLLISION:')) {
          throw new ConflictError(message.replace(/^ID_COLLISION:\s*/, ''));
        }
      }
      throw error;
    }
  }
}

interface NodesPostRequest extends IRequest {
  node_id: string;
  uri: string;
  certificate?: unknown;
  region?: string | null;
  anchor_id?: string;
  vnode_proof?: unknown;
  vnodes?: unknown;
}

type NodesPostResponse = RegisterNodeResult;

type NodesPostEnv = TrackerEnv;

export { NodesPostRoute };
export type { NodesPostEnv, NodesPostRequest, NodesPostResponse };
