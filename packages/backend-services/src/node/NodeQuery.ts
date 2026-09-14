import { parseNodeJsonColumns } from '@chord-dht-tracker/backend-data/dao';
import type { NodeDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import { BadRequestError, NotFoundError } from '@chord-dht-tracker/backend-errors';
import type { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import { NODE_ID_PATTERN, sanitizeNode } from '@chord-dht-tracker/shared';
import type {
  Certificate,
  NodeInfo,
  PublicTrackerNodeRecord,
  TrackerNodeRecord,
} from '@chord-dht-tracker/shared';

interface ListNodesOptions {
  status?: string;
  region?: string;
  includeVnodes?: boolean;
  limit?: number;
  offset?: number;
  admin?: boolean;
}

interface ListNodesResult {
  nodes: Array<TrackerNodeRecord | PublicTrackerNodeRecord>;
  total: number;
  limit: number;
  offset: number;
}

interface SeedOptions {
  count?: number;
  excludeIds?: string[];
  includeCert?: boolean;
}

interface NodeQueryDeps {
  nodeDAO?: () => Promise<NodeDAO>;
  vnodeDAO?: () => Promise<VNodeDAO>;
  config?: AppConfiguration;
}

// NodeQuery owns anchor/vnode reads: listing, lookup, seeds, region counts.
// Moved verbatim from NodeService; SQL stays in backend-data DAOs.
class NodeQuery {
  private readonly deps: Required<NodeQueryDeps>;

  constructor(deps: Required<NodeQueryDeps>) {
    this.deps = deps;
  }

  public async listNodes(options: ListNodesOptions = {}): Promise<ListNodesResult> {
    const limit = options.limit === undefined || Number.isNaN(options.limit) ? 50 : Math.max(1, Math.min(200, options.limit));
    const offset = options.offset === undefined || Number.isNaN(options.offset) ? 0 : Math.max(0, options.offset);
    const admin = options.admin ?? false;
    const nodeDAO = await this.deps.nodeDAO();
    const nodes = await nodeDAO.listAnchors({ status: options.status, region: options.region, limit, offset });
    const total = await nodeDAO.countAnchors({ status: options.status, region: options.region });
    const parsed = nodes.map((n) => parseNodeJsonColumns({ ...n, is_vnode: false }));
    const sanitized = parsed.map((n) => sanitizeNode(n, admin));
    if (!admin || sanitized.length === 0) return { nodes: sanitized, total, limit, offset };
    const vnodeDAO = await this.deps.vnodeDAO();
    const full = sanitized as TrackerNodeRecord[];
    const withVnodes = await Promise.all(
      full.map(async (n) => {
        if ((n.vnode_count ?? 0) === 0) return n;
        return { ...n, vnodes: await vnodeDAO.listByAnchor(n.node_id) };
      }),
    );
    if (options.includeVnodes) {
      const logical = await vnodeDAO.listLogicalByAnchors(parsed.map((n) => n.node_id));
      return { nodes: [...withVnodes, ...logical], total, limit, offset };
    }
    return { nodes: withVnodes, total, limit, offset };
  }

  public async getById(nodeId: string, admin = false): Promise<TrackerNodeRecord | PublicTrackerNodeRecord> {
    if (!NODE_ID_PATTERN.test(nodeId)) {
      throw new BadRequestError('node_id must be a 40-character lowercase hex string');
    }
    const nodeDAO = await this.deps.nodeDAO();
    const node = await nodeDAO.findAnchorById(nodeId);
    if (node) return sanitizeNode(parseNodeJsonColumns({ ...node, is_vnode: false }), admin);
    if (admin) {
      const vnodeDAO = await this.deps.vnodeDAO();
      const vnode = await vnodeDAO.findLogicalById(nodeId);
      if (vnode) return vnode;
    }
    throw new NotFoundError(`Node ${nodeId} not found`);
  }

  public async getSeeds(options: SeedOptions = {}): Promise<{ seeds: NodeInfo[]; total_known: number; note: string }> {
    const count = options.count === undefined || Number.isNaN(options.count) ? 5 : Math.max(1, Math.min(20, options.count));
    const cutoff = new Date(Date.now() - this.deps.config.getStaleThresholdSeconds() * 1000).toISOString();
    const nodeDAO = await this.deps.nodeDAO();
    const rows = await nodeDAO.listSeeds({
      cutoffIso: cutoff,
      excludeIds: options.excludeIds ?? [],
      count,
      includeCert: options.includeCert ?? false,
    });
    const seeds: NodeInfo[] = rows.map((row) => {
      const seed: NodeInfo = { node_id: row.node_id, uri: row.uri };
      if (options.includeCert && row.cert_json) {
        try {
          seed.certificate = JSON.parse(row.cert_json) as Certificate;
        } catch {
          // Skip malformed cert
        }
      }
      return seed;
    });
    return { seeds, total_known: await nodeDAO.countAll(), note: 'Nodes selected randomly from active list' };
  }

  public async regionCounts(): Promise<{ regions: Record<string, number> }> {
    const nodeDAO = await this.deps.nodeDAO();
    return { regions: await nodeDAO.regionCounts() };
  }
}

export { NodeQuery };
export type { ListNodesOptions, ListNodesResult, NodeQueryDeps, SeedOptions };
