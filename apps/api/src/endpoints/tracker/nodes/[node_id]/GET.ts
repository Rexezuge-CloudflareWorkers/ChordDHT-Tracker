import { BadRequestError } from '@chord-dht-tracker/backend-errors';
import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import type { PublicTrackerNodeRecord, TrackerNodeRecord } from '@chord-dht-tracker/shared';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

const NODE_ID_REGEX = /^[0-9a-f]{40}$/;

class NodeGetRoute extends IBaseRoute<NodeGetRequest, NodeGetResponse, NodeGetEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Get a specific node record',
    responses: {
      '200': {
        description: 'Node record (full data requires admin token)',
      },
    },
  };

  protected async handleRequest(
    request: NodeGetRequest,
    env: NodeGetEnv,
    cxt: RouteContext<NodeGetEnv>,
  ): Promise<NodeGetResponse> {
    const node_id = this.getPathParam(cxt, 'node_id');
    if (!NODE_ID_REGEX.test(node_id)) {
      throw new BadRequestError('node_id must be a 40-character lowercase hex string');
    }

    const scope = createRequestScope(env);
    const admin = await scope.get(Tokens.AuthService).isAdmin(request.raw);
    return scope.get(Tokens.NodeService).getById(node_id, admin);
  }
}

type NodeGetRequest = IRequest;

type NodeGetResponse = (TrackerNodeRecord | PublicTrackerNodeRecord);

type NodeGetEnv = TrackerEnv;

export { NodeGetRoute };
export type { NodeGetEnv, NodeGetRequest, NodeGetResponse };
