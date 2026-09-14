import { z } from 'zod';
import { TRACKER_MAX_VNODES_PER_ANCHOR } from '../constants/Tracker';
import { CertificateSchema, HttpsUriSchema, NodeIdSchema, VNodeProofSchema, nonEmptyStringSchema } from './common';

interface RequestInputSchema {
  body?: z.ZodType;
  query?: z.ZodType;
}

const VNodeHeartbeatBodySchema = z.object({
  vnode_id: NodeIdSchema,
  status: z.string().max(64).optional(),
  successor_id: NodeIdSchema.nullable().optional(),
  predecessor_id: NodeIdSchema.nullable().optional(),
  successor_list_size: z.number().int().min(0).optional(),
  successor_list_capacity: z.number().int().min(0).optional(),
  finger_table_coverage: z.number().min(0).max(1).optional(),
  uptime_seconds: z.number().int().min(0).optional(),
  maintenance_cycles: z.number().int().min(0).optional(),
  cert_expires_at: z.number().int().nullable().optional(),
  region: z.string().max(64).nullable().optional(),
  maintenance_mode: z.string().max(32).optional(),
  cache_hits: z.number().int().min(0).optional(),
  cache_misses: z.number().int().min(0).optional(),
  cache_size: z.number().int().min(0).optional(),
  predecessor_list_size: z.number().int().min(0).optional(),
  successor_list: z.array(NodeIdSchema).optional(),
  predecessor_list: z.array(NodeIdSchema).optional(),
  rtt_samples: z.record(z.string(), z.number()).optional(),
  finger_nodes: z.array(NodeIdSchema).optional(),
});

const HeartbeatBodySchema = z.object({
  status: z.string().max(64).optional(),
  successor_id: NodeIdSchema.nullable().optional(),
  predecessor_id: NodeIdSchema.nullable().optional(),
  successor_list_size: z.number().int().min(0).optional(),
  successor_list_capacity: z.number().int().min(0).optional(),
  finger_table_coverage: z.number().min(0).max(1).optional(),
  uptime_seconds: z.number().int().min(0).optional(),
  maintenance_cycles: z.number().int().min(0).optional(),
  cert_expires_at: z.number().int().nullable().optional(),
  region: z.string().max(64).nullable().optional(),
  maintenance_mode: z.string().max(32).optional(),
  cache_hits: z.number().int().min(0).optional(),
  cache_misses: z.number().int().min(0).optional(),
  cache_size: z.number().int().min(0).optional(),
  predecessor_list_size: z.number().int().min(0).optional(),
  successor_list: z.array(NodeIdSchema).optional(),
  predecessor_list: z.array(NodeIdSchema).optional(),
  rtt_samples: z.record(z.string(), z.number()).optional(),
  finger_nodes: z.array(NodeIdSchema).optional(),
  // Per-entry vnode snapshots are validated by the service (unknown vnodes are
  // reported per-item, not fatal), so the route schema only bounds the batch.
  vnode_heartbeats: z.array(z.unknown()).max(TRACKER_MAX_VNODES_PER_ANCHOR).optional(),
});

const RegisterNodeBodySchema = z.object({
  node_id: NodeIdSchema,
  uri: HttpsUriSchema,
  certificate: CertificateSchema.optional(),
  region: z.string().max(64).optional().nullable(),
  anchor_id: NodeIdSchema.optional(),
  vnode_proof: VNodeProofSchema.optional().nullable(),
  // Inline vnode entries are validated per-entry by the service (invalid
  // entries are skipped, not fatal), so the route schema accepts unknowns.
  vnodes: z.array(z.unknown()).optional(),
});

const NodeListQuerySchema = z.object({
  status: nonEmptyStringSchema('status', 64).optional(),
  region: nonEmptyStringSchema('region', 64).optional(),
  include_vnodes: nonEmptyStringSchema('include_vnodes', 8).optional(),
  limit: nonEmptyStringSchema('limit', 8).optional(),
  offset: nonEmptyStringSchema('offset', 16).optional(),
});

const SeedNodesQuerySchema = z.object({
  count: nonEmptyStringSchema('count', 8).optional(),
  region: nonEmptyStringSchema('region', 64).optional(),
  exclude: z.string().max(8192).optional(),
  include_cert: nonEmptyStringSchema('include_cert', 8).optional(),
});

const CrlUploadBodySchema = z.object({
  version: z.number().int().min(1, 'version must be a positive integer.'),
  updated_at: z.number().int('updated_at must be a number.'),
  revoked_node_ids: z.array(NodeIdSchema),
  signature: z.string().min(1, 'signature is required.'),
});

const RequestInputSchemas: Record<string, RequestInputSchema> = {
  'POST /tracker/nodes': { body: RegisterNodeBodySchema },
  'POST /tracker/nodes/:node_id/heartbeat': { body: HeartbeatBodySchema },
  'POST /tracker/crl': { body: CrlUploadBodySchema },
  'GET /tracker/nodes': { query: NodeListQuerySchema },
  'GET /tracker/nodes/seeds': { query: SeedNodesQuerySchema },
  'GET /tracker/health': {},
  'GET /tracker/stats': {},
  'GET /tracker/policy': {},
  'GET /tracker/stable_base': {},
  'GET /tracker/nodes/:node_id': {},
  'DELETE /tracker/nodes/:node_id': {},
  'GET /tracker/crl': {},
  'GET /tracker/regions': {},
  'GET /tracker/admin/verify': {},
};

export {
  CrlUploadBodySchema,
  HeartbeatBodySchema,
  NodeListQuerySchema,
  RegisterNodeBodySchema,
  RequestInputSchemas,
  SeedNodesQuerySchema,
  VNodeHeartbeatBodySchema,
};
export type { RequestInputSchema };
