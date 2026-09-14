import { NodeDAO } from '@chord-dht-tracker/backend-data/dao';
import type { D1Queryable } from '@chord-dht-tracker/backend-data/utils';
import { InternalServerError } from '@chord-dht-tracker/backend-errors';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import type { CertService } from '../auth/CertService';

interface StableBaseMember {
  node_id: string;
  uri: string;
  registered: boolean;
  status: string | null;
  last_seen: string | null;
  live: boolean;
}

interface StableBaseResult {
  stable_base_min_size: number;
  configured_count: number;
  live_count: number;
  degraded: boolean;
  emergency: boolean;
  emergency_threshold: number;
  stale_threshold_seconds: number;
  checked_at: string;
  members: StableBaseMember[];
}

interface StableBaseServiceDeps {
  nodeDAO?: () => Promise<NodeDAO>;
  certService?: () => Promise<CertService>;
  config?: AppConfiguration;
}

// StableBaseService reports configured stable-base member liveness.
// Liveness is on-demand from stored last_seen/status; the Worker never pings.
class StableBaseService {
  private readonly deps: Required<StableBaseServiceDeps>;

  constructor(
    private readonly env: ServiceEnv,
    deps: StableBaseServiceDeps = {},
  ) {
    const db = env.DB as D1Queryable;
    this.deps = {
      nodeDAO: () => Promise.resolve(new NodeDAO(db)),
      certService: () => Promise.reject(new Error('CertService is not bound for this scope.')),
      config: AppConfiguration.fromEnv(env),
      ...deps,
    };
  }

  public async getStableBase(now: Date = new Date()): Promise<StableBaseResult> {
    const config = this.deps.config;
    const certService = await this.deps.certService();
    let memberURIs: string[];
    try {
      memberURIs = config.getStableBaseMembersList().map((member) => certService.normalizeURI(member));
    } catch (error: unknown) {
      throw new InternalServerError(error instanceof Error ? error.message : String(error));
    }

    const checkedAtIso = now.toISOString();
    const staleThresholdSeconds = config.getStaleThresholdSeconds();
    const staleCutoff = new Date(now.getTime() - staleThresholdSeconds * 1000).toISOString();
    const minSize = config.getStableBaseMinSize();

    const configured = await Promise.all(memberURIs.map(async (uri) => ({ uri, node_id: await certService.hashURI(uri) })));
    const nodeDAO = await this.deps.nodeDAO();
    const rows = await nodeDAO.stableBaseLookup(configured.map((member) => member.node_id));
    const rowsByID = new Map(rows.map((row) => [row.node_id, row]));
    const members: StableBaseMember[] = configured.map((member) => {
      const row = rowsByID.get(member.node_id);
      const live = !!row && row.status === 'ACTIVE' && row.last_seen >= staleCutoff;
      return {
        node_id: member.node_id,
        uri: member.uri,
        registered: !!row,
        status: row?.status ?? null,
        last_seen: row?.last_seen ?? null,
        live,
      };
    });

    const liveCount = members.filter((member) => member.live).length;
    const emergencyThreshold = Math.floor(minSize / 2) + 1;
    return {
      stable_base_min_size: minSize,
      configured_count: members.length,
      live_count: liveCount,
      degraded: liveCount < minSize,
      emergency: liveCount < emergencyThreshold,
      emergency_threshold: emergencyThreshold,
      stale_threshold_seconds: staleThresholdSeconds,
      checked_at: checkedAtIso,
      members,
    };
  }
}

export { StableBaseService };
export type { StableBaseMember, StableBaseResult, StableBaseServiceDeps };
