# ChordDHT-Tracker — Backend Runtime (DI + Config)

Scope: `packages/backend-runtime/**`. Parent index: `../../AGENTS.md`.

`di/` (`Container` Factory + Singleton: `bind`/`bindValue`/`get`/`resolve`/`createChild`; `createServiceContext(env, overrides?)` → `{ env, logger, clock }`), `config/` (`ConfigurationDefaults.ts` defaults, `ConfigurationManager` static facade with `tracker`/`vnodePolicy`/`stableBase` groups, `AppConfiguration` injectable view, `EnvParser`, `ServiceEnv`), `base/` (`AbstractEntrypointWorker`, `AbstractDurableObjectWorker`), `constants/do/` (`Hostnames.ts`). Depends only on `@chord-dht-tracker/shared`. Add new env vars in `ConfigurationDefaults.ts` (+ manager getter + `AppConfiguration` method), not inline.
