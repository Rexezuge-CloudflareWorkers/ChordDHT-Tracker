import type { CrlDAO, NodeDAO, TrackerMetaDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import type { D1Queryable } from '@chord-dht-tracker/backend-data/utils';
import type { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import type { Token } from '@chord-dht-tracker/backend-runtime/di';
import type { AuthService } from '../auth/AuthService';
import type { CertService } from '../auth/CertService';
import type { CrlService } from '../crl/CrlService';
import type { MaintenanceService } from '../maintenance/MaintenanceService';
import type { NodeService } from '../node/NodeService';
import type { StableBaseService } from '../stable-base/StableBaseService';
import type { StatsService } from '../stats/StatsService';
import type { VNodeService } from '../vnode/VNodeService';

// Central token registry for the per-request composition root
// (`requestScope.ts`). Call sites resolve services via
// `scope.get(Tokens.NodeService)` instead of `new X(env)`.
//
// Tokens carry their value type (`Token<T>`) so `scope.get(...)` infers the
// service type without an explicit generic at call sites.
// Mirrors RequestScopeEnv (D1 narrowed to D1Queryable); kept as the token
// value type so `scope.get(Tokens.Env)` infers the request env shape.
interface RequestScopeEnvShape extends Omit<ServiceEnv, 'DB'> {
  DB: D1Queryable;
}

interface RequestKeysShape {
  caKey: CryptoKey | null;
}

const Tokens = {
  Env: Symbol('Env') as Token<RequestScopeEnvShape>,
  Db: Symbol('Db') as Token<D1Queryable>,
  Keys: Symbol('Keys') as Token<() => Promise<RequestKeysShape>>,
  NodeDAO: Symbol('NodeDAO') as Token<() => Promise<NodeDAO>>,
  VNodeDAO: Symbol('VNodeDAO') as Token<() => Promise<VNodeDAO>>,
  CrlDAO: Symbol('CrlDAO') as Token<() => Promise<CrlDAO>>,
  MetaDAO: Symbol('MetaDAO') as Token<() => Promise<TrackerMetaDAO>>,
  AuthService: Symbol('AuthService') as Token<AuthService>,
  CertService: Symbol('CertService') as Token<CertService>,
  NodeService: Symbol('NodeService') as Token<NodeService>,
  VNodeService: Symbol('VNodeService') as Token<VNodeService>,
  StatsService: Symbol('StatsService') as Token<StatsService>,
  StableBaseService: Symbol('StableBaseService') as Token<StableBaseService>,
  CrlService: Symbol('CrlService') as Token<CrlService>,
  MaintenanceService: Symbol('MaintenanceService') as Token<MaintenanceService>,
  AppConfig: Symbol('AppConfig') as Token<AppConfiguration>,
} satisfies Record<string, Token<unknown>>;

export { Tokens };
export type { RequestKeysShape, RequestScopeEnvShape };
