import { CryptoService } from '@chord-dht-tracker/backend-data/crypto';
import { CrlDAO, NodeDAO, TrackerMetaDAO, VNodeDAO } from '@chord-dht-tracker/backend-data/dao';
import type { D1Queryable } from '@chord-dht-tracker/backend-data/utils';
import { AppConfiguration } from '@chord-dht-tracker/backend-runtime/config';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import { Container } from '@chord-dht-tracker/backend-runtime/di';
// NOTE: service imports use the package entry points
// (`@chord-dht-tracker/backend-services/...`) rather than relative file paths
// so route unit tests mocking those modules keep working after migration to
// `scope.get(...)`. Runtime behavior is identical.
import { AuthService, CertService } from '@chord-dht-tracker/backend-services/auth';
import { CrlService } from '@chord-dht-tracker/backend-services/crl';
import { MaintenanceService } from '@chord-dht-tracker/backend-services/maintenance';
import { NodeService } from '@chord-dht-tracker/backend-services/node';
import { StableBaseService } from '@chord-dht-tracker/backend-services/stable-base';
import { StatsService } from '@chord-dht-tracker/backend-services/stats';
import { VNodeService } from '@chord-dht-tracker/backend-services/vnode';
import { Tokens } from './tokens';

// Request env structurally matches ServiceEnv (D1 narrowed to D1Queryable,
// since Layer 1 backend-runtime must not import backend-data). Any full
// ServiceEnv value is assignable here, and this env passes directly to
// service constructors typed as ServiceEnv — no `as never` casts.
//
// NOTE: no `[key: string]: unknown` index signature on purpose — interfaces
// (e.g. endpoint `*Env`) do not carry an implicit index signature, so a target
// with one would reject every `createRequestScope(env)` call site. Extra
// bindings are still assignable structurally.
interface RequestScopeEnv extends Omit<ServiceEnv, 'DB'> {
  DB: D1Queryable;
}

interface RequestKeys {
  caKey: CryptoKey | null;
}

function memoize<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= fn());
}

// Composition root: builds a per-request scope wiring DAOs → services.
// Replaces scattered `new XService(env)` / `new XDAO(db)` call sites in apps/api.
function createRequestScope(env: RequestScopeEnv): Container {
  const scope = new Container();
  scope.bindValue(Tokens.Env, env);
  scope.bindValue(Tokens.Db, env.DB);

  const crypto = new CryptoService();
  const caKey = memoize((): Promise<CryptoKey | null> => crypto.getCAPublicKey(env));
  const keys = memoize(async (): Promise<RequestKeys> => ({ caKey: await caKey() }));
  scope.bindValue(Tokens.Keys, keys);

  const nodeDAO = memoize(() => Promise.resolve(new NodeDAO(env.DB)));
  const vnodeDAO = memoize(() => Promise.resolve(new VNodeDAO(env.DB)));
  const crlDAO = memoize(() => Promise.resolve(new CrlDAO(env.DB)));
  const metaDAO = memoize(() => Promise.resolve(new TrackerMetaDAO(env.DB)));
  scope.bindValue(Tokens.NodeDAO, nodeDAO);
  scope.bindValue(Tokens.VNodeDAO, vnodeDAO);
  scope.bindValue(Tokens.CrlDAO, crlDAO);
  scope.bindValue(Tokens.MetaDAO, metaDAO);

  // Lazy bind so the factory only touches AppConfiguration when resolved.
  scope.bind(Tokens.AppConfig, () => AppConfiguration.fromEnv(env));
  scope.bind(Tokens.AuthService, () => new AuthService(env));
  scope.bind(Tokens.CertService, () => new CertService(env, { caKey, crypto }));
  scope.bind(
    Tokens.VNodeService,
    () => new VNodeService(env, { vnodeDAO, crypto, config: scope.get(Tokens.AppConfig) }),
  );
  scope.bind(
    Tokens.NodeService,
    () =>
      new NodeService(env, {
        nodeDAO,
        vnodeDAO,
        certService: () => Promise.resolve(scope.get(Tokens.CertService)),
        vnodeService: () => Promise.resolve(scope.get(Tokens.VNodeService)),
        crlDAO,
        config: scope.get(Tokens.AppConfig),
      }),
  );
  scope.bind(
    Tokens.StatsService,
    () =>
      new StatsService(env, {
        nodeDAO,
        vnodeDAO,
        metaDAO,
        config: scope.get(Tokens.AppConfig),
      }),
  );
  scope.bind(
    Tokens.StableBaseService,
    () =>
      new StableBaseService(env, {
        nodeDAO,
        certService: () => Promise.resolve(scope.get(Tokens.CertService)),
        config: scope.get(Tokens.AppConfig),
      }),
  );
  scope.bind(
    Tokens.CrlService,
    () =>
      new CrlService(env, {
        crlDAO,
        certService: () => Promise.resolve(scope.get(Tokens.CertService)),
      }),
  );
  scope.bind(
    Tokens.MaintenanceService,
    () =>
      new MaintenanceService(env, {
        nodeDAO,
        vnodeDAO,
        config: scope.get(Tokens.AppConfig),
      }),
  );

  return scope;
}

export { createRequestScope };
export type { RequestKeys, RequestScopeEnv };
