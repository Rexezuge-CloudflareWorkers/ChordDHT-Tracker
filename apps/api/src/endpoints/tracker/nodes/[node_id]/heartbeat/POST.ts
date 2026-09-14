import { BadRequestError, RateLimitedError } from '@chord-dht-tracker/backend-errors';
import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import type { HeartbeatResult } from '@chord-dht-tracker/backend-services/node';
import type { HeartbeatBody } from '@chord-dht-tracker/shared';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodeHeartbeatPostRoute extends IBaseRoute<NodeHeartbeatPostRequest, NodeHeartbeatPostResponse, NodeHeartbeatPostEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Update node liveness and ring state',
    responses: {
      '200': {
        description: 'Heartbeat result',
      },
    },
  };

  protected async handleRequest(
    request: NodeHeartbeatPostRequest,
    env: NodeHeartbeatPostEnv,
    cxt: RouteContext<NodeHeartbeatPostEnv>,
  ): Promise<NodeHeartbeatPostResponse> {
    const node_id = this.getPathParam(cxt, 'node_id');
    if (!NODE_ID_REGEX.test(node_id)) {
      throw new BadRequestError('node_id must be a 40-character lowercase hex string');
    }

    const { success } = await env.NODE_RATE_LIMITER.limit({ key: node_id });
    if (!success) {
      throw new RateLimitedError('Rate limit exceeded for this node');
    }

    const body: HeartbeatBody = request;
    const scope = createRequestScope(env);
    return scope.get(Tokens.NodeService).heartbeat(node_id, body);
  }
}

type NodeHeartbeatPostRequest = IRequest & HeartbeatBody;

type NodeHeartbeatPostResponse = HeartbeatResult;

type NodeHeartbeatPostEnv = TrackerEnv;

export { NodeHeartbeatPostRoute };
export type { NodeHeartbeatPostEnv, NodeHeartbeatPostRequest, NodeHeartbeatPostResponse };
