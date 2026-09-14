# ChordDHT-Tracker — Testing

Scope: unit + integration tests. Parent index: `../../../AGENTS.md`.

Current thresholds (`vitest.config.mts`): **statements 88.5 / branches 76.5 / functions 90.5 / lines 89.5**. Exclusions: `**/*.test.ts`, `**/*.d.ts`, `**/index.ts`, `**/types.d.ts`, `**/model/**` (pure TS types). Coverage includes `apps/api/src/**`, `apps/background/src/**`, `packages/**/src/**`.

- Unit: `pnpm run test` (`vitest run`, excludes `test/integration/**`).
- Coverage gate: `pnpm run test:coverage` (`vitest run --coverage`) — CI `checks` job fails below thresholds.
- Integration: `pnpm run test:integration` (`vitest run --config test/integration/vitest.config.mts`) — CI `integration-tests` job. Uses `@cloudflare/vitest-pool-workers` (no V8 coverage — no thresholds there, omitted intentionally). 15 files sharing `helpers/setup.ts` (migrations + secrets-store keys + `SELF` request helpers + real-crypto factories; cert `node_id` values must equal `uriNodeId(uri)`) — see `helpers/migrations.ts:splitSql`.
- God-file guard: `scripts/check-god-files.mjs` (soft 300 / hard 400 LOC; CI runs it as a strict gate with no `continue-on-error` — intentionally stricter than Otter's warn-only).

**Covered** (test files exist in `test/`): all 15 tracker endpoints (`health`, `stats`, `nodes`, `nodeGetDelete`, `seeds`, `heartbeat`, `crl`, `regions`, `geo`, `policy`, `stable_base`, `adminVerify`) plus route mapping (`ibaseRoute`, `nodesPostMapping`), services (`nodeService`, `vnodeService`, `maintenanceService`, `authService`, `certService`, `crlService`, `stableBaseService`, `statsService`, `defaultDeps`), DAOs (`nodeDao`, `vnodeDao`, `crlDao`, `trackerMetaDao`, `baseDao`, `cryptoService`, `d1Utils`), shared/data utils (`utils/sharedUtils`, `utils/dataUtils`), DI (`container`, `requestScope`, `serviceContext`, `errorTaxonomy`), cron/stale-cleanup (`cron/staleCleanup`, `workers/staleCleanupWorker`, `workers/scheduledForwarding`). Mocks in `test/mocks/` (`d1.ts` incl. `withSession`/`getBookmark`, `env.ts`, `cloudflare-workers.ts`); cloudflare socket/worker/workflow aliases are wired in `vitest.config.mts`.

**Error-shape contract**: route errors use the `{ Exception: { Type, Message } }` envelope (`BadRequest` 400, `Unauthorized` 401, `NotFound` 404, `Conflict` 409, `RateLimited` 429, `ServiceUnavailable` 503, `InternalServerError` 500). Assert `body.Exception.Type`, not legacy `body.error.code`.

**Mock patterns**:

- DAO/D1 tests: `createMockDb()`-style stubs returning `prepare().bind().run/first/all` chains with shared `vi.fn()` refs (`run` resolves `{ success: true, meta }`).
- Services with env: inject `AppConfiguration` or `ServiceContext` doubles via constructor — do not module-mock env parsing.
- Crypto: stub Web Crypto (`crypto.subtle`) Ed25519 paths rather than real key generation where timing matters.
- External time: inject `IClock` (`SystemClock` in prod, fake in tests) instead of `Date.now()` in new code.
- Use `vi.hoisted()` for mocks referenced across `vi.mock` factories.
- `beforeEach` + `vi.clearAllMocks()` resets call counts.
