import { CrlDAO, NodeDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import type { D1Queryable } from '@chord-dht-tracker/backend-data/utils';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type {
  HeartbeatBody,
  NodeInfo,
  PublicTrackerNodeRecord,
  TrackerNodeRecord,
} from '@chord-dht-tracker/shared';
import type { CertService } from '../auth/CertService';
import type { VNodeService } from '../vnode/VNodeService';
import { NodeHeartbeat } from './NodeHeartbeat';
import type { HeartbeatResult } from './NodeHeartbeat';
import { NodeQuery } from './NodeQuery';
import type { ListNodesOptions, ListNodesResult, SeedOptions } from './NodeQuery';
import { NodeRegistration } from './NodeRegistration';
import type { RegisterNodeInput, RegisterNodeResult } from './NodeRegistration';

interface NodeServiceDeps {
  nodeDAO?: () => Promise<NodeDAO>;
  vnodeDAO?: () => Promise<VNodeDAO>;
  certService?: () => Promise<CertService>;
  vnodeService?: () => Promise<VNodeService>;
  crlDAO?: () => Promise<CrlDAO>;
  config?: AppConfiguration;
}

// NodeService orchestrates anchor/vnode registration, listing, lookup,
// deletion, seeds, heartbeats, and region counts. Business logic lives in
// NodeRegistration/NodeHeartbeat/NodeQuery; SQL stays in backend-data DAOs
// and crypto in CertService/VNodeService. No direct D1 access here.
class NodeService {
  private readonly deps: Required<NodeServiceDeps>;
  private readonly registration: NodeRegistration;
  private readonly heartbeatHandler: NodeHeartbeat;
  private readonly query: NodeQuery;

  constructor(
    private readonly env: unknown,
    deps: NodeServiceDeps = {},
  ) {
    const db = (env as { DB?: D1Queryable }).DB as D1Queryable;
    this.deps = {
      nodeDAO: () => Promise.resolve(new NodeDAO(db)),
      vnodeDAO: () => Promise.resolve(new VNodeDAO(db)),
      certService: () => Promise.reject(new Error('CertService is not bound for this scope.')),
      vnodeService: () => Promise.reject(new Error('VNodeService is not bound for this scope.')),
      crlDAO: () => Promise.resolve(new CrlDAO(db)),
      config: AppConfiguration.fromEnv(env),
      ...deps,
    };
    this.registration = new NodeRegistration(this.deps);
    this.heartbeatHandler = new NodeHeartbeat(this.deps);
    this.query = new NodeQuery(this.deps);
  }

  public async registerAnchorOrVnode(input: RegisterNodeInput): Promise<RegisterNodeResult> {
    return this.registration.registerAnchorOrVnode(input);
  }

  public async listNodes(options: ListNodesOptions = {}): Promise<ListNodesResult> {
    return this.query.listNodes(options);
  }

  public async getById(nodeId: string, admin = false): Promise<TrackerNodeRecord | PublicTrackerNodeRecord> {
    return this.query.getById(nodeId, admin);
  }

  public async deleteNode(nodeId: string): Promise<{ deregistered: boolean; node_id: string }> {
    return this.registration.deleteNode(nodeId);
  }

  public async getSeeds(options: SeedOptions = {}): Promise<{ seeds: NodeInfo[]; total_known: number; note: string }> {
    return this.query.getSeeds(options);
  }

  public async heartbeat(nodeId: string, body: HeartbeatBody): Promise<HeartbeatResult> {
    return this.heartbeatHandler.heartbeat(nodeId, body);
  }

  public async regionCounts(): Promise<{ regions: Record<string, number> }> {
    return this.query.regionCounts();
  }
}

export { NodeService };
export type {
  
  
  
  NodeServiceDeps,
  
  
  
};

export {type HeartbeatCrl, type HeartbeatResult} from './NodeHeartbeat';
export {type ListNodesOptions, type ListNodesResult, type SeedOptions} from './NodeQuery';
export {type RegisterNodeInput, type RegisterNodeResult} from './NodeRegistration';