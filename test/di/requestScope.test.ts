import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@chord-dht-tracker/backend-services/auth';
import { createRequestScope, Tokens } from '@chord-dht-tracker/backend-services/composition';
import type { RequestScopeEnv } from '@chord-dht-tracker/backend-services/composition';
import { CrlService } from '@chord-dht-tracker/backend-services/crl';
import { MaintenanceService } from '@chord-dht-tracker/backend-services/maintenance';
import { NodeService } from '@chord-dht-tracker/backend-services/node';
import { StableBaseService } from '@chord-dht-tracker/backend-services/stable-base';
import { StatsService } from '@chord-dht-tracker/backend-services/stats';
import { VNodeService } from '@chord-dht-tracker/backend-services/vnode';
import { createD1 } from '../mocks/d1';
import { createEnv } from '../mocks/env';

function setup() {
  const db = createD1();
  const env = createEnv(db) as unknown as RequestScopeEnv;
  return { scope: createRequestScope(env), env };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createRequestScope', () => {
  it('wires every service behind its token', () => {
    const { scope, env } = setup();

    expect(scope.get(Tokens.Env)).toBe(env);
    expect(scope.get(Tokens.AuthService)).toBeInstanceOf(AuthService);
    expect(scope.get(Tokens.NodeService)).toBeInstanceOf(NodeService);
    expect(scope.get(Tokens.VNodeService)).toBeInstanceOf(VNodeService);
    expect(scope.get(Tokens.StatsService)).toBeInstanceOf(StatsService);
    expect(scope.get(Tokens.StableBaseService)).toBeInstanceOf(StableBaseService);
    expect(scope.get(Tokens.CrlService)).toBeInstanceOf(CrlService);
    expect(scope.get(Tokens.MaintenanceService)).toBeInstanceOf(MaintenanceService);
  });

  it('shares the request env configuration across services', () => {
    const { scope } = setup();

    expect(scope.get(Tokens.AppConfig).getMaxNodes()).toBe(1000);
    expect(scope.get(Tokens.AppConfig).getStaleThresholdSeconds()).toBe(600);
  });

  it('memoizes DAO factories per request', async () => {
    const { scope } = setup();

    const nodeDAO = scope.get(Tokens.NodeDAO);
    await expect(nodeDAO()).resolves.toBe(await nodeDAO());
    await expect(scope.get(Tokens.VNodeDAO)()).resolves.toBeDefined();
    await expect(scope.get(Tokens.CrlDAO)()).resolves.toBeDefined();
    await expect(scope.get(Tokens.MetaDAO)()).resolves.toBeDefined();
  });

  it('resolves request-scoped services without memoizing', () => {
    const { scope } = setup();

    // bind() (not bindValue) registrations resolve fresh instances.
    expect(scope.resolve(Tokens.NodeService)).not.toBe(scope.resolve(Tokens.NodeService));
  });
});
