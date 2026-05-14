# Agent Run Log

## 2026-05-14 - Baseline Inventory

- What was inspected: repository location, Git status, `package.json`, Next/Vercel config, route list, env key names, Supabase table references, existing docs, Open Roles API/UI, job ingest routes, Gmail send routes, auth helpers.
- What changed: no application behavior changed during inventory.
- Files changed: none.
- Tests/checks run: `git status --short --branch`, `rg --files`, env-key inventory with values redacted, route/table reference searches.
- Result: sandbox repo is `D:\KOHLER database\_repos\kohler-outreach-sandbox`; worktree already had uncommitted job-ingest/Open Roles edits.
- Remaining work: document baseline and implement smallest safety/diagnostic improvements.
- Assumptions made: uncommitted edits are prior user/session work and must be preserved.

## 2026-05-14 - Runtime Diagnostics And Safety Gates

- What was inspected: Open Roles data path, Gmail SMTP routes, scheduler assumptions, current parser version fields.
- What changed: added `getRuntimeEnvironment`, `/api/runtime-diagnostics`, Open Roles diagnostics panel, live-send gates, government aggregate polling gate, and contact-enrichment cron gate.
- Files changed: `src/lib/runtimeEnvironment.ts`, `src/app/api/runtime-diagnostics/route.ts`, `src/app/open-roles/page.tsx`, `src/lib/outreachSafety.ts`, `src/app/api/send-email/route.ts`, `src/app/api/approve-followup/route.ts`, `src/app/api/ingest/careers/route.ts`, `src/app/api/cron/research/route.ts`, `src/app/queue/page.tsx`, `src/app/company/[companyname]/page.tsx`.
- Tests/checks run: `npm run build`, `git diff --check`, browser smoke test at `http://localhost:3000/open-roles`.
- Result: sandbox UI can show environment/parser/Supabase/sync/Gmail/safety metadata; live Gmail send and government aggregate polling are explicit opt-ins. Build and whitespace checks passed; browser smoke showed diagnostics and Open Roles content with no console errors.
- Remaining work: run checks and fix failures.
- Assumptions made: `human_approved` can be stored in the existing `status` field without schema changes.

## 2026-05-14 - Kohler Fit Scoring

- What was inspected: existing `targeting.ts`, `outreachScore.ts`, Open Roles API/UI response shape.
- What changed: added `scoreJobForKohler`, Open Roles company/job score metadata, recommended next action, and a focused Node test harness.
- Files changed: `src/lib/kohlerFitScore.ts`, `src/app/api/open-roles-list/route.ts`, `src/app/api/relevant-roles/route.ts`, `src/app/open-roles/page.tsx`, `scripts/kohler-fit-score.test.mjs`, `package.json`.
- Tests/checks run: `npm run test:fit`, `npm run build`, browser smoke test at `http://localhost:3000/open-roles`.
- Result: open jobs can receive non-persisted Kohler fit, PE-track, explanation, and recommended action metadata. Fit tests and build passed.
- Remaining work: persist scores in `role_fit_scores` after schema approval.
- Assumptions made: schema changes require approval, so scoring is computed at read time for now.

## 2026-05-14 - Check Results

- What was inspected: test/build output, Open Roles rendered DOM, browser console errors, diff whitespace.
- What changed: adjusted fit-score weighting after the first focused test showed the obvious EIT/MEP/SolidWorks case scored too low; cleaned stale `.next` artifacts after local `next start` tried to require a missing generated chunk; tightened runtime environment detection so `VERCEL_TARGET_ENV` does not override sandbox identity.
- Files changed: `src/lib/kohlerFitScore.ts`, `src/lib/runtimeEnvironment.ts`, `docs/agent-run-log.md`.
- Tests/checks run: `npm run test:fit`, `npm run build`, `npm run lint`, `git diff --check`, local production server smoke test.
- Result: `npm run test:fit` passed, `npm run build` passed, `git diff --check` passed, local production smoke passed for `/open-roles`, `/api/open-roles-list`, and `/api/runtime-diagnostics` with app origin. `npm run lint` is not configured and opened Next.js interactive ESLint setup, so no lint result is available.
- Remaining work: add an ESLint config only with approval if the project wants lint enforced.
- Assumptions made: Next's interactive ESLint setup should not be completed autonomously because it changes project tooling/config.

## 2026-05-14 - Additive Provenance And Fit Persistence Prep

- What was inspected: current worktree, `package.json`, `next.config.js`, `vercel.json`, `docs/agent-run-log.md`, `docs/sandbox-current-state.md`, `/api/ingest/careers`, `/api/ingest/ziprecruiter`, `/api/open-roles-list`, `/api/relevant-roles`.
- What changed: added additive migration `supabase/migrations/202605140001_job_intelligence_spine.sql` for `job_sources`, `sync_runs`, `role_fit_scores`, and `outreach_actions`; added optional persistence helpers; added protected `POST /api/jobs/rescore` route; wired `/api/ingest/careers` to record `sync_runs` when the migration is applied.
- Files changed: `supabase/migrations/202605140001_job_intelligence_spine.sql`, `src/lib/optionalDb.ts`, `src/lib/roleFitScoreStore.ts`, `src/lib/syncRunStore.ts`, `src/app/api/jobs/rescore/route.ts`, `src/app/api/ingest/careers/route.ts`, `scripts/schema-contract.test.mjs`, `package.json`, docs.
- Tests/checks run: `npm run test:fit`, `npm run test:schema`, `npm run build`, `git diff --check`, local production smoke for `POST /api/jobs/rescore` dry-run.
- Result: all checks passed. The rescore route returned 200 with 3 dry-run samples and no writes. Migration was prepared but not applied.
- Remaining work: apply the migration in sandbox, then run `POST /api/jobs/rescore` with `dryRun=false` to backfill `role_fit_scores`.
- Assumptions made: additive SQL files are approved, but direct application to Supabase still requires an explicit deploy/apply step.

## 2026-05-14 - Production-Style Project Migration And Backfill

- What was inspected: Supabase CLI availability, local env project ref, Supabase dashboard project label, SQL editor warning, `/api/jobs/rescore` behavior, and server-side table counts.
- What changed: applied `supabase/migrations/202605140001_job_intelligence_spine.sql` to Supabase project `acwgirrldntjpzrhqmdh` before the separate true-sandbox project was discovered; tightened the migration so all four new tables enable Row Level Security; fixed scoring so mechanical engineering roles and relevant open roles are not under-scored; persisted 273 Kohler fit-score rows through `POST /api/jobs/rescore` with `dryRun=false`; fixed the runtime badge so local production builds still identify this repo as sandbox.
- Files changed: `supabase/migrations/202605140001_job_intelligence_spine.sql`, `src/lib/kohlerFitScore.ts`, `src/lib/runtimeEnvironment.ts`, `src/app/api/open-roles-list/route.ts`, `src/app/api/relevant-roles/route.ts`, `scripts/schema-contract.test.mjs`, `docs/sandbox-current-state.md`, `docs/architecture.md`, `docs/verification-report.md`, `docs/production-promotion-plan.md`, `docs/agent-run-log.md`.
- Tests/checks run: `npx --yes supabase --version`, `npx --yes supabase projects list`, Supabase SQL editor execution, `npm run test:fit`, `npm run test:schema`, `npm run build`, local `next start`, protected `/api/jobs/rescore` write smoke, Supabase table-count verification, browser smoke at `/open-roles`.
- Result: migration applied successfully in the production-style project; `role_fit_scores` contains 273 rows; `job_sources`, `sync_runs`, and `outreach_actions` exist with zero rows; rescore write smoke returned `persisted=273`, `missingTable=false`, and no errors. This is no longer the sandbox baseline after true-sandbox discovery.
- Remaining work: surface persisted scores in dashboard metrics where useful, and create the next action/draft workflow.
- Assumptions made: the user's approval covers additive sandbox schema application. The Supabase dashboard labels project `acwgirrldntjpzrhqmdh` as `main Production`, so future promotion work should confirm environment naming before production release.

## 2026-05-14 - Live Schema Inventory And Operating Guardrails

- What was inspected: availability of a Supabase MCP in this Codex session, Supabase PostgREST schema exposure, authenticated Supabase SQL editor access, and live `information_schema.tables` / `information_schema.columns` for project `acwgirrldntjpzrhqmdh`.
- What changed: added live schema inventory artifacts and an operating plan that requires schema inventory before future migrations; documented one-phase-per-session handoff behavior and a narrow project-specific tool scope.
- Files changed: `docs/supabase-live-schema-inventory.json`, `docs/supabase-live-schema-inventory.md`, `docs/agent-operating-plan.md`, `docs/sandbox-current-state.md`, `docs/architecture.md`, `docs/verification-report.md`, `docs/agent-run-log.md`.
- Tests/checks run: Supabase service-role probe for `information_schema` exposure, Supabase SQL editor live inventory query, local JSON parse and table-summary checks.
- Result: current live public schema has 39 tables/views. PostgREST cannot query `information_schema` directly because only `public` and `graphql_public` are exposed; the authenticated SQL editor path succeeded.
- Remaining work: reconcile planned phases against the live inventory before adding more schema or provider code.
- Assumptions made: without a callable Supabase MCP in this environment, the authenticated SQL editor query is the authoritative live-schema fallback.

## 2026-05-14 - Vercel Env And Supabase CLI Prep

- What was inspected: Vercel project `kohler-outreach-sandbox` environment variables, local `.env.production.local`/`.env.local` key presence, local Vercel project link, and Supabase CLI login/link behavior.
- What changed: added `NEXT_PUBLIC_APP_ENV=sandbox` to Vercel project `kohler-outreach-sandbox`; initialized Supabase CLI config in the repo with `supabase/config.toml` and `supabase/.gitignore`.
- Files changed: `supabase/config.toml`, `supabase/.gitignore`, `docs/agent-run-log.md`.
- Tests/checks run: Vercel Browser check for existing env vars, `npx --yes supabase init`, `npx --yes supabase link --project-ref acwgirrldntjpzrhqmdh`, `npx --yes supabase login --no-browser`.
- Result: Vercel already had Supabase URL/key/service role and API secret; only `NEXT_PUBLIC_APP_ENV` was missing and is now present for Production and Preview. Supabase CLI linking is blocked until `SUPABASE_ACCESS_TOKEN` is provided or an interactive login is completed outside this non-TTY session.
- Remaining work: provide a Supabase access token through local env/MCP config, then run `npx supabase link --project-ref acwgirrldntjpzrhqmdh`.
- Assumptions made: absent `ENABLE_LIVE_SEND`, `ENABLE_GOVERNMENT_JOB_SOURCES`, and `ENABLE_CONTACT_ENRICHMENT` should remain off.

## 2026-05-14 - Supabase CLI Link And True Sandbox Discovery

- What was inspected: persisted `SUPABASE_ACCESS_TOKEN`, Supabase CLI login/link, Supabase project list, migration history for `KOHLER OS`, migration history for `Kohler Outreach Sandbox`, live schema inventory for `nwsjgppkfducaikxsyvk`, and row counts for core sandbox tables.
- What changed: logged Supabase CLI in, linked the repo first to `acwgirrldntjpzrhqmdh` for verification, then to the actual sandbox project `nwsjgppkfducaikxsyvk`; added true-sandbox schema and row-count artifacts.
- Files changed: `docs/supabase-true-sandbox-schema-inventory.json`, `docs/supabase-true-sandbox-schema-inventory.md`, `docs/supabase-true-sandbox-row-counts.json`, `docs/sandbox-database-targets.md`, `docs/agent-run-log.md`.
- Tests/checks run: `npx supabase login --token`, `npx supabase link --project-ref acwgirrldntjpzrhqmdh`, `npx supabase projects list -o json`, `npx supabase migration list`, `npx supabase link --project-ref nwsjgppkfducaikxsyvk`, true-sandbox SQL editor `information_schema` inventory, true-sandbox row count query.
- Result: CLI auth and linking work. `KOHLER OS` has many remote migrations not present locally. `Kohler Outreach Sandbox` has 13 public tables/views and useful data: 398 companies, 788 contacts, 248 job listings, 173 outreach drafts, 1 Gmail account, and 64 job ingest runs.
- Remaining work: switch `kohler-outreach-sandbox` Vercel Supabase env vars from `acwgirrldntjpzrhqmdh` to `nwsjgppkfducaikxsyvk` after retrieving the sandbox project's server-side keys; then apply only approved additive migrations to the true sandbox.
- Assumptions made: `acwgirrldntjpzrhqmdh` should now be treated as production data, and `nwsjgppkfducaikxsyvk` is the correct sandbox data target.

## 2026-05-14 - True Sandbox Runtime Switch And Command Center Fix

- What was inspected: linked Supabase project file, latest local database backup, true-sandbox migration history, local `.env.local`/`.env.production.local`, Vercel project `kohler-outreach-sandbox` environment variables, `/api/runtime-diagnostics`, `/api/open-roles-list`, and the rendered `/open-roles` UI.
- What changed: backed up ignored local env files; switched local env and Vercel Supabase variables to `nwsjgppkfducaikxsyvk`; applied additive migration `202605140001_job_intelligence_spine.sql` to the true sandbox; backfilled 185 true-sandbox `role_fit_scores`; fixed runtime diagnostics to read `job_ingest_runs.started_at`; added a command-center job filter so Open Roles uses Kohler fit scoring instead of hiding almost every job behind the older strict URL filter.
- Files changed: `.env.local` and `.env.production.local` locally only, Vercel env vars remotely, `src/app/api/runtime-diagnostics/route.ts`, `src/lib/jobCommandCenter.ts`, `src/app/api/open-roles-list/route.ts`, `src/app/api/relevant-roles/route.ts`, docs.
- Tests/checks run: `npx supabase migration list`, `npx supabase db push --dry-run`, `npx supabase db push`, `npx supabase inspect db table-stats`, `POST /api/jobs/rescore` dry-run and write, Supabase table-count check, `npm run test:fit`, `npm run test:schema`, `npm run build`, `git diff --check`, Browser smoke at `http://localhost:3000/open-roles`, Vercel deployment-page check.
- Result: true sandbox now has `job_sources`, `sync_runs`, `role_fit_scores`, and `outreach_actions`; `role_fit_scores` count is 185; runtime diagnostics show sandbox project `nwsjgppkfducaikxsyvk`, 185 tracked jobs, 123 tracked companies, Gmail cursor set, safety gates off, and latest ingest run status; Open Roles displays 161 screened jobs across 105 companies; branch `sandbox-runtime-db-alignment` was committed and pushed; Vercel created a Ready preview deployment, but the preview URL is protected by Vercel Deployment Protection and API calls require an auth/bypass cookie.
- Remaining work: merge/deploy the branch to sandbox `main` after local review, then implement the next action/draft workflow.
- Assumptions made: sandbox runtime should point to `nwsjgppkfducaikxsyvk`; Vercel env changes should not be followed by redeploy until code is committed/pushed.

## 2026-05-14 - Open Roles Score Label Clarification

- What was inspected: user-visible `/open-roles` score chips, `contacts` table fields, Mines alumni evidence currently available in contact notes/LinkedIn fields, and local browser rendering.
- What changed: changed the visible Kohler score from raw numbers like `Fit 42` to bands such as `Good fit` and `Strong fit`; renamed the PE chip to `PE path` or `No PE signal` so it is not mistaken for a staff count; added a `Mines` chip for known Colorado School of Mines alumni in company contacts; added a minimum fit filter between company search and niche filter.
- Files changed: `src/app/api/open-roles-list/route.ts`, `src/app/open-roles/page.tsx`, `docs/agent-run-log.md`.
- Tests/checks run: `npm run test:fit`, `npm run test:schema`, `npm run build`, browser smoke at `http://localhost:3000/open-roles`.
- Result: local Open Roles shows three filters, non-clipped mobile/tablet layout, fit bands, explicit PE-path wording, and Mines alumni counts. Current visible open-role companies have zero known Mines alumni from the existing contact evidence; one known Mines alum exists in contacts for `360 Engineering`, which is not currently in the visible open-role list.
- Remaining work: add a dedicated alumni evidence table/provider flow before treating Mines alumni counts as complete.
- Assumptions made: `Mines 0` means zero known/captured alumni evidence, not proof that no alumni work there.
