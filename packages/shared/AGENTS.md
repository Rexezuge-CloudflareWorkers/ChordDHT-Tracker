# ChordDHT-Tracker — Shared

Scope: `packages/shared/**`. Parent index: `../../AGENTS.md`.

Zero-dependency (except `zod`) shared kernel: `constants/Tracker.ts` (ring defaults, `NODE_ID_PATTERN`), `model/` (`TrackerNode.ts`, `VNode.ts`), `schema/` (`common.ts`, `input.ts` route schemas, `index.ts` `validateRequestInput` + `getRequestInputSchema`), `utils/` (`Result`, `Cursor`, `Clock`, `Logger`, `CryptoUtil`, `TimestampUtil`, `IdGenerator`). Pure types and helpers only — no env, binding, or Worker imports. Note: `vnodes[]` / `vnode_heartbeats[]` route schemas accept unknown entries and bound the batch; per-entry validation (skip/report semantics) lives in the services.
