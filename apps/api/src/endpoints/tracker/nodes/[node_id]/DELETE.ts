import { BadRequestError } from '@chord-dht-tracker/backend-errors';
import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, IResponse, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodeDeleteRoute extends IBaseRoute<NodeDeleteRequest, NodeDeleteResponse, NodeDeleteEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Deregister a node',
    responses: {
      '200': {
        description: 'Deregistration result',
      },
    },
  };

  protected async handleRequest(
    _request: NodeDeleteRequest,
    env: NodeDeleteEnv,
    cxt: RouteContext<NodeDeleteEnv>,
  ): Promise<NodeDeleteResponse> {
    const node_id = this.getPathParam(cxt, 'node_id');
    if (!NODE_ID_REGEX.test(node_id)) {
      throw new BadRequestError('node_id must be a 40-character lowercase hex string');
    }

    const scope = createRequestScope(env);
    return scope.get(Tokens.NodeService).deleteNode(node_id);
  }
}

type NodeDeleteRequest = IRequest;

interface NodeDeleteResponse extends IResponse {
  deregistered: boolean;
  node_id: string;
}

type NodeDeleteEnv = TrackerEnv;

export { NodeDeleteRoute };
export type { NodeDeleteEnv, NodeDeleteRequest, NodeDeleteResponse };
