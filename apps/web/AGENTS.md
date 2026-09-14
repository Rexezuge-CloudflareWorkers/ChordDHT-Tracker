# ChordDHT-Tracker — Web SPA

Scope: `apps/web/**`. Parent index: `../../AGENTS.md`.

Vite React dashboard served as Cloudflare Workers Assets (`apps/web/dist/`). Root component `src/SpaApp.tsx` (composition only — data lives in hooks/context).

- `src/services/` — Tracker API clients (`nodesService`, `statsService`, `regionsService`, `adminService`, barrel `index.ts`).
- `src/hooks/useTrackerData.ts` — polling (`GET /tracker/nodes` + `GET /tracker/stats` on `REFRESH_INTERVAL_MS`, default 5 s; `GET /tracker/regions` in admin mode), admin session, region filter, pause/resume.
- `src/adapters/nodeAdapter.ts` — pure view mapping (`toVisibleNodes` masking rule, `toAccessibleNodes`, `computeStaleCutoff`).
- `src/contexts/TrackerContext.tsx` — auth slice (`isAdmin`, `login`, `logout`; `useTrackerAuth()`).
- `src/components/`: `RingVisualization.tsx` (SVG ring plot by SHA-1 angle, color-coded by status), `NodeTable.tsx` (sortable list), `StatsPanel.tsx` (anchor + vnode summary groups), `NodeDetailPanel.tsx` (per-node ring-state drawer), `LoginModal.tsx` (admin `ADMIN_SECRET` entry), `ring/` (canvas/topology helpers), `shared/LanguageSelector.tsx`.
- `src/i18n.ts` + `src/locales/{en,de}/translation.json` — i18next harness (lazy per-locale chunks via static glob; `loadLanguage()`, `normalizeLanguage()`, `detectInitialLanguage()`). Header chrome, section titles, filters, empty states, and login are translated; data-dense panels keep literals (extend incrementally).
- Support modules: `src/types.ts`, `src/constants.ts` (refresh interval), `src/utils.ts`.

- Admin login unlocks full node data, region filter, and masked detail-panel fields.
- Pause/Resume halts auto-refresh without reload.
- Build with `pnpm --filter @chord-dht-tracker/web build`; the `closeBundle` plugin embeds `dist/index.html` into `apps/api/src/generated/spa-shell.ts` (`postinstall` ensures the stub exists).
