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

### Phase 3 — Stabilize job ingestion + provenance

**Inspected**
- `src/app/api/ingest/ziprecruiter/route.ts` (parser v5, body-based) —
  found that `job_listings` already carries `source`, `external_job_key`,
  `gmail_message_id`, `received_at`, `first_seen_at`, `last_seen_at`,
  `times_seen`, `is_relevant`, `match_score`, `relevance_reason`,
  `raw_payload`, `ingest_status`, and `parser_version`.
- `src/app/api/ingest/careers/route.ts` (parser v1, careers/USAJOBS/Built In)
  — same set of columns, plus `closeExistingJob` that flips
  `ingest_status` to `closed` without a timestamp.

**Changed**
- Created `supabase/migrations/0001_provenance.sql` (additive only):
  - new `job_sources` registry table seeded with the 18 source_types in
    use (ziprecruiter_email, governmentjobs_*, builtin_colorado, usajobs,
    manual_seed, greenhouse/lever/ashby/workday/icims/smartrecruiters/
    workable/jsonld/career_links, dice/blueorigin/ball);
  - new `sync_runs` table that supersedes `job_ingest_runs` for adapter
    use (job_ingest_runs preserved untouched);
  - additive columns on `job_listings`: `source_url`, `apply_url`,
    `normalized_hash`, `closed_at`;
  - additive indexes on `(source, external_job_key)`, `normalized_hash`,
    `closed_at`;
  - one-time backfill that copies `job_url` into `apply_url` where null.
- Created `src/lib/jobIngest/normalization.ts` — exported
  `normalizeCompanyName`, `slugify`, `buildZipRecruiterContentKey`,
  `buildGovJobKey`, `canonicalizeUrl`, `normalizedHash`,
  `buildExternalJobKey`. These are 1:1 with the in-route helpers, so future
  Phase 4 adapters can reuse them and a refactor of the ingest routes can
  delete the duplicates without behavior change.
- Created `src/lib/syncRuns.ts` — `startSyncRun`, `finishSyncRun`,
  `errorSyncRun`. Falls back to a one-time warning when the
  `sync_runs` table doesn't exist yet, so adapters keep working in
  pre-migration environments.
- Created `scripts/normalization.test.mjs` — 19 cases covering company
  normalization, slugify, ZipRecruiter content keys, URL canonicalization,
  normalized hash stability, and external-key fallback.

**Tests / checks**
- `node scripts/normalization.test.mjs` → 19 passed, 0 failed.
- `npx tsc --noEmit` → exit 0, no errors.

**Result**
- Migration ready. Once applied, `sync_runs` becomes available for
  Phase 4 adapters and the diagnostics route auto-switches to it.
- All future adapter code can call `startSyncRun` / `finishSyncRun`
  without depending on the legacy `job_ingest_runs` shape.

**Remaining work**
- The existing ZipRecruiter route still writes to `job_ingest_runs`. That
  is intentional — Phase 12 will document the swap once the migration
  has shipped to production. New Phase 4 adapters use `sync_runs` from
  the start.

**Assumptions made**
1. Migration is additive and safe to apply to production. It uses
   `IF NOT EXISTS` everywhere and `ON CONFLICT DO NOTHING` on the seed.
2. `apply_url` and `job_url` are kept distinct so adapters that know an
   ATS-style apply link different from the source URL can record both.
3. `normalized_hash` is informational for now (no UNIQUE constraint) so
   migration cannot fail on existing duplicate content.

### Phase 4 — Job source adapter architecture

**Inspected**
- `src/app/api/ingest/careers/route.ts` to confirm the existing per-source
  branches (Built In Colorado, GovernmentJobs direct, USAJOBS, JSON-LD,
  career-link scrape) — these are out of scope for Phase 4 because they
  already work; Phase 4 introduces *new* ATS adapters (Greenhouse, Lever,
  Ashby) plus a generic sync route on top of them.

**Changed**
- `src/lib/jobIngest/types.ts` — `NormalizedJob`, `AdapterCompany`,
  `JobSourceAdapter`, `AdapterRegistry` (matches the contracts in
  `docs/architecture.md`).
- `src/lib/jobIngest/adapters/greenhouse.ts` — public boards-api adapter,
  detects slug from `boards.greenhouse.io/{slug}` URLs.
- `src/lib/jobIngest/adapters/lever.ts` — public lever postings adapter,
  detects slug from `jobs.lever.co/{slug}` URLs.
- `src/lib/jobIngest/adapters/ashby.ts` — public Ashby job-board adapter,
  detects slug from `jobs.ashbyhq.com/{slug}` URLs.
- `src/lib/jobIngest/adapters/manualSeed.ts` — placeholder for hand-entered
  rows (read-only).
- `src/lib/jobIngest/adapters/mock.ts` — deterministic mock adapter so
  tests and local dev can exercise the path without network access.
- `src/lib/jobIngest/registry.ts` — `adapterRegistry.list/get` plus
  `detectAdapterFromCareersUrl(url)`.
- `src/lib/jobIngest/persist.ts` — `persistNormalizedJobs(jobs)` writes
  to `job_listings` with the new provenance columns, runs
  `scoreTargetRole`, and counts inserts/updates/skips/errors.
- `src/app/api/jobs/sync-source/route.ts` — POST `{ source_type,
  company_id|companyname, limit?, dryRun? }` for one company.
- `src/app/api/jobs/sync-all/route.ts` — POST `{ source_types?,
  max_companies?, limit?, dryRun? }` that iterates the eligible
  ATS/careers adapters across companies that have a careers URL.
- `scripts/adapters.test.mjs` — 14 cases for slug detection across the
  three ATS providers and minimal parsing-shape contracts.

**Tests / checks**
- `node scripts/adapters.test.mjs` → 14 passed, 0 failed.
- `npx tsc --noEmit` → clean (one cast widened to a named type).

**Result**
- The sandbox can now ingest jobs from any company whose careers_url
  points at Greenhouse / Lever / Ashby with no extra credentials.
- Sync runs are recorded in `sync_runs` (when the migration is applied)
  with per-source counters and adapter warnings.
- The legacy `/api/ingest/ziprecruiter` and `/api/ingest/careers`
  routes are untouched and remain authoritative for those source types.

**Remaining work**
- Phase 5 will introduce per-row fit scoring that reads the new
  `body_text` adapters return (Greenhouse `content`, Lever
  `descriptionPlain`, Ashby `descriptionPlain`) so PE/Mines/skill
  signals get higher resolution than today's title-only scoring.
- A future phase can refactor the existing ingest routes to share
  `persistNormalizedJobs`, but that's deferred to keep this commit
  reviewable.

**Assumptions made**
1. ATS slug detection from `careers_url` is sufficient for the first pass.
   When a company hosts its board outside the canonical domain (e.g.
   `careers.example.com`), an `ats_slug` column must be set manually —
   the adapter looks for that field first.
2. Adapters never throw to the caller; errors and warnings are returned
   in arrays so the sync routes can log them in `sync_runs.warnings`.
3. The sync-all route deliberately excludes email/manual sources because
   their existing routes are already wired into cron and the prompt asked
   for additive work.
