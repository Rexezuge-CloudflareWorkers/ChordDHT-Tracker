import { CrlDAO } from '@chord-dht-tracker/backend-data/dao';
import type { D1Queryable } from '@chord-dht-tracker/backend-data/utils';
import { BadRequestError, InternalServerError, NotFoundError } from '@chord-dht-tracker/backend-errors';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import type { CertService } from '../auth/CertService';

interface CrlUploadInput {
  version?: unknown;
  updated_at?: unknown;
  revoked_node_ids?: unknown;
  signature?: unknown;
}

interface CrlUploadResult {
  updated: boolean;
  version: number;
  revoked_count: number;
}

interface CrlServiceDeps {
  crlDAO?: () => Promise<CrlDAO>;
  certService?: () => Promise<CertService>;
}

// CrlService owns CRL reads and CA-signed uploads, including the version
// monotonicity check. Signature verification delegates to CertService.
class CrlService {
  private readonly deps: Required<CrlServiceDeps>;

  constructor(
    private readonly env: ServiceEnv,
    deps: CrlServiceDeps = {},
  ) {
    const db = env.DB as D1Queryable;
    this.deps = {
      crlDAO: () => Promise.resolve(new CrlDAO(db)),
      certService: () => Promise.reject(new Error('CertService is not bound for this scope.')),
      ...deps,
    };
  }

  public async getLatest(): Promise<string> {
    const crlDAO = await this.deps.crlDAO();
    const crlJson = await crlDAO.getLatest();
    if (!crlJson) throw new NotFoundError('No CRL available');
    return crlJson;
  }

  public async upload(input: CrlUploadInput): Promise<CrlUploadResult> {
    const { version, updated_at, revoked_node_ids, signature } = input;
    if (typeof version !== 'number' || typeof updated_at !== 'number' || typeof signature !== 'string') {
      throw new BadRequestError('CRL must have version, updated_at, revoked_node_ids, and signature fields');
    }
    if (!Array.isArray(revoked_node_ids)) {
      throw new BadRequestError('CRL must have version, updated_at, revoked_node_ids, and signature fields');
    }
    const typedCRL = {
      version,
      updated_at,
      revoked_node_ids: revoked_node_ids as string[],
      signature,
    };

    const certService = await this.deps.certService();
    const caKey = await certService.getCAPublicKey();
    // 503 mapping happens at the endpoint (ServiceUnavailableError).
    if (!caKey) throw new InternalServerError('CA public key not configured');
    if (!(await certService.verifyCRL(typedCRL, caKey))) {
      throw new BadRequestError('CRL signature verification failed');
    }

    const crlDAO = await this.deps.crlDAO();
    const existing = await crlDAO.getLatestVersion();
    if (existing !== null && typedCRL.version <= existing) {
      // VERSION_CONFLICT prefix contract: endpoints map this to 409 ConflictError.
      throw new BadRequestError(`VERSION_CONFLICT: CRL version must be greater than current version (${existing})`);
    }
    await crlDAO.insert(typedCRL.version, typedCRL.updated_at, JSON.stringify(typedCRL));
    return { updated: true, version: typedCRL.version, revoked_count: typedCRL.revoked_node_ids.length };
  }
}

export { CrlService };
export type { CrlServiceDeps, CrlUploadInput, CrlUploadResult };
