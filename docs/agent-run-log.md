# Agent Run Log — Claude Sandbox

> Append-only log of every major step the autonomous agent takes against this
> sandbox. Most-recent entries at the bottom of each session block.

## Session 2026-05-14 — initial bootstrap

### Setup
- **Agent:** Claude (Opus 4.7).
- **Workspace:** `D:/KOHLER database/_repos/kohler-outreach-claude-sandbox/`.
- **Origin:** cloned fresh from
  `https://github.com/STUDIOPARCELS/kohler-outreach-sandbox.git` at commit
  `013115e` (`Scan job QA candidates until pass target`).
- **Why a separate clone:** another AI is already iterating in
  `kohler-outreach-sandbox`. To avoid clobbering its in-progress work, Claude
  works in this independent copy.
- **Assumption:** Codex's WIP (uncommitted changes in the other clone) is not
  needed here; this clone follows the GitHub HEAD.

### Phase 1 — Inventory & baseline map

**Inspected**
- `package.json`, `next.config.js`, `vercel.json`, `README.md`.
- All `src/app/page.tsx` and `src/app/api/**/route.ts` files via `find`.
- All `.from("…")` usages via grep — produced the authoritative table list.
- All `process.env.*` usages via grep — produced the env-var matrix.
- `src/lib/{auth,googleAuth,jobLinks,outreachScore,supabaseAdmin,targeting}.ts`.
- Existing `docs/deploy-map.md`, `docs/mines-alumni-scoring.md`.

**Changed**
- Created `docs/sandbox-current-state.md` (Phase 1 baseline map).
- Created `docs/agent-run-log.md` (this file).

**Tests / checks**
- None executed yet (Phase 1 is read-only inventory).

**Result**
- Inventory complete. Baseline doc lists 9 pages, 40 API routes, 6 lib
  helpers, 13 Supabase tables, 21 env vars, and the 11-row gap matrix that
  drives Phases 2–10.

**Remaining work**
- Phases 2–12 still pending. Phase 2 (sandbox env badge) is next.

**Assumptions made**
1. Sandbox URL is `kohler-outreach-sandbox.vercel.app`; production is
   `kohler-outreach.vercel.app`. Confirmed in `auth.ts` and `deploy-map.md`.
2. The `jobs` table is legacy (only `import-ziprecruiter` writes it); the
   live job table is `job_listings`. Phases 3+ build on `job_listings`.
3. Resend is in `package.json` but unused in `src/`; Gmail SMTP via
   nodemailer is the active outbound path.
4. Production-only fallbacks in `googleAuth.ts`, `layout.tsx`,
   `approve-followup`, `send-email`, and `google/callback` are intentional
   today; Phase 12 will document the swap at promotion time.

### Phase 2 — Sandbox env badge & runtime diagnostics

**Inspected**
- `src/components/Nav.tsx` (orphaned — not imported by any page).
- `src/app/layout.tsx` (the only globally-mounted React tree).
- `src/app/api/health/route.ts` (existing thin health probe).
- ZipRecruiter and careers parser version constants
  (`parser_version: 5` and `parser_version: 1`).

**Changed**
- Added `src/lib/runtimeEnvironment.ts` with `getRuntimeEnvironment()` that
  reads `VERCEL_ENV`, `NEXT_PUBLIC_APP_ENV`, `VERCEL_URL`, branch info,
  Supabase host, parser versions, `ENABLE_LIVE_SEND`, portfolio URL, and
  resume URL.
- Added `src/app/api/runtime-diagnostics/route.ts` — server-only route that
  returns environment + jobs snapshot + ingest snapshot + Gmail cursors +
  warnings. Tries `sync_runs` first, falls back to `job_ingest_runs`, so it
  works before Phase 3 ships and after.
- Added `src/components/EnvironmentBadge.tsx` — a fixed-position, click-to-
  expand badge that fetches `/api/runtime-diagnostics` and displays env,
  branch, parser versions, live-send state, job counts, and last sync.
- Wired `<EnvironmentBadge />` into `src/app/layout.tsx`.
- Added `scripts/runtime-environment.test.mjs` — 10 cases for the
  classification rules.
- Added `npm run typecheck` (`tsc --noEmit`) and `npm test` scripts to
  `package.json`.

**Tests / checks**
- `node scripts/runtime-environment.test.mjs` → 10 passed, 0 failed.
- `npx tsc --noEmit` → exit 0, no errors.

**Result**
- Sandbox UI now identifies itself with a green SANDBOX badge; production
  builds will render a red PRODUCTION badge; previews render amber.
- The badge surfaces parser versions, live-send state, job counts, last
  sync timestamp, and Gmail cursor health without exposing secrets.

**Remaining work**
- Phase 3 will introduce `sync_runs` so the badge starts surfacing the
  unified runs table instead of the legacy `job_ingest_runs`.

**Assumptions made**
1. Layout is the only safe place to render a global badge (Nav is unused).
2. `NEXT_PUBLIC_APP_ENV` is the explicit override for unusual Vercel
   aliases; documented in production-promotion-plan.md.
3. The badge can rely on `fetch("/api/runtime-diagnostics")` since the route
   is same-origin and wide open by design (read-only, no secrets returned).
