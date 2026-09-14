import { BadRequestError, ConflictError, InternalServerError, ServiceUnavailableError } from '@chord-dht-tracker/backend-errors';
import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import type { CrlUploadResult } from '@chord-dht-tracker/backend-services/crl';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IRequest, RouteContext, TrackerEnv } from '@/endpoints/IBaseRoute';

class CRLPostRoute extends IBaseRoute<CRLPostRequest, CRLPostResponse, CRLPostEnv> {
  public override schema = {
    tags: ['tracker'],
    summary: 'Upload a new CA-signed CRL',
    responses: {
      '200': {
        description: 'CRL upload result',
      },
    },
  };

  protected async handleRequest(
    request: CRLPostRequest,
    env: CRLPostEnv,
    _cxt: RouteContext<CRLPostEnv>,
  ): Promise<CRLPostResponse> {
    const scope = createRequestScope(env);
    try {
      return await scope.get(Tokens.CrlService).upload(request);
    } catch (error: unknown) {
      if (error instanceof InternalServerError && error.getErrorMessage().includes('CA public key not configured')) {
        throw new ServiceUnavailableError('CA public key not configured');
      }
      if (error instanceof BadRequestError) {
        const message = error.getErrorMessage();
        if (message.startsWith('VERSION_CONFLICT:')) {
          throw new ConflictError(message.replace(/^VERSION_CONFLICT:\s*/, ''));
        }
      }
      throw error;
    }
  }
}

interface CRLPostRequest extends IRequest {
  version: number;
  updated_at: number;
  revoked_node_ids: string[];
  signature: string;
}

type CRLPostResponse = CrlUploadResult;

type CRLPostEnv = TrackerEnv;

export { CRLPostRoute };
export type { CRLPostEnv, CRLPostRequest, CRLPostResponse };
