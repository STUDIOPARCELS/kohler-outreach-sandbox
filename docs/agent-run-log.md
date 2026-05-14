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

### Phase 5 — Kohler fit scoring

**Inspected**
- `src/lib/targeting.ts` (existing `scoreTargetRole`) — a single-number
  score with reasons; doesn't separate skill/PE/niche/location/Mines.

**Changed**
- `src/lib/kohlerFitScore.ts` — `scoreJobForKohler(job, profile?)` returns
  six sub-scores plus `overall_score`, `recommended_action`, and a
  structured `explanation_json` (`matched_skills`, `pe_signals`,
  `location_band`, `niche_match`, `seniority_flag`, `notes`). Defaults
  encode Kohler's profile (BSME / EIT, Mines alumnus, Lakewood ZIP,
  the SolidWorks / FEA / CFD / CNC / DFM / FMEA / MEP skill list).
- `supabase/migrations/0002_role_fit_scores.sql` — new
  `role_fit_scores` table with sub-score columns, `recommended_action`,
  `explanation_json`, `unique (job_id, candidate_profile_id)`, plus
  three indexes (overall desc, action, pe desc). Also defensively seeds
  `candidate_profile.id = 1` if the table is present.
- `src/app/api/jobs/rescore/route.ts` — POST `{ job_id | job_ids[] |
  all_relevant }` that scores in-memory and upserts into
  `role_fit_scores`. Degrades to a useful response if the table is
  missing, so it works pre-migration too.
- `scripts/kohler-fit-score.test.mjs` — 10 cases covering:
  entry-level Denver MEP, senior out-of-state, mid-tier manufacturing,
  Mines explicit mention, remote location band, and manager title.

**Tests / checks**
- `node scripts/kohler-fit-score.test.mjs` → 10 passed, 0 failed.
- `npx tsc --noEmit` → clean.

**Result**
- Every job in `job_listings` can be scored on demand. `role_fit_scores`
  is upserted by `(job_id, candidate_profile_id)` so re-runs are safe.
- Recommended actions enumerate the eight values requested in the
  prompt: `apply_now`, `email_engineering_manager`, `email_recruiter`,
  `alumni_outreach`, `pe_track_outreach`, `physical_letter`, `monitor`,
  `skip`.

**Remaining work**
- Phase 6 wires `role_fit_scores` into the Open Roles UI for sort,
  filter, recommended-action button, and explanation tooltip.
- Phase 8 templates will read `recommended_action` to pick the right
  outreach copy.

**Assumptions made**
1. PE-track signals are detected on the lower-cased combined corpus
   (title + body + description). False positives like " p.e. " are
   intentional — Kohler's pipeline favors recall over precision here.
2. The default skill list mirrors the prompt verbatim. Real candidate
   profile rows can override `skills`, `pe_track`, `is_mines_alumni`.
3. `recommended_action="skip"` is set for senior_only roles below
   overall=60; everything else falls through to a softer recommendation.

### Phase 6 — Open Roles command center UI

**Inspected**
- `src/app/open-roles/page.tsx` — large existing page with its own state
  shape; touching it directly would risk regressions, so the command
  center ships as a *new* page at `/command-center` with a Nav link.
- `src/components/Nav.tsx` — existed but wasn't mounted by the layout.

**Changed**
- `src/app/api/jobs/command-center/route.ts` — server route returning
  per-company roll-ups + per-job rows, joined with `role_fit_scores`,
  `contacts`, and `reachout_company_inserts`. Inline-scores any job
  missing a persisted fit row so the page works pre-Phase-5 migration.
  Sort modes: `overall`, `pe`, `recent`.
- `src/app/command-center/page.tsx` — client page with:
  - four KPI tiles (open roles, companies, PE-track signals,
    persisted fit coverage);
  - sort + recommended-action filter + companies/jobs view toggle;
  - per-company cards showing best role, recommended action,
    overall + PE scores, contacts (count + email count + best),
    outreach status (drafts/printed/sent), last-seen date, and
    quick links to `/company/[name]` and the careers URL;
  - per-job table with title, company, location, source, scores,
    explanation notes, and an external open link;
  - "Rescore all" button that POSTs to `/api/jobs/rescore` and
    refreshes the data.
- `src/components/Nav.tsx` — added Command center link as the first
  entry; reordered remaining links.
- `src/app/layout.tsx` — mounted `<Nav />` so the new page (and the
  existing pages) are now navigable from anywhere.

**Tests / checks**
- `npx tsc --noEmit` → clean. Fixed a Supabase `.from(...).select(...)`
  thenable type issue by widening the helper to `PromiseLike<...>`.

**Result**
- `/command-center` answers the five product questions on one screen:
  - which target companies have new roles (per-company roll-up);
  - which roles fit Kohler best (overall + PE sort);
  - which roles support PE-track (PE filter + score column);
  - who is the best person to contact (contact summary on each card);
  - what is the next best action (recommended-action pill).

**Remaining work**
- The command-center action buttons currently link out — the
  "Find contacts" / "Create draft" actions become real in Phases 7-8.
- The existing `/open-roles` page is unchanged; it can be retired once
  Kohler confirms the new page covers his daily flow.

**Assumptions made**
1. Mounting Nav globally is desirable. Existing pages were rendering
   without it, so they pick up a header for the first time. That is a
   visible change and worth flagging in the production promotion plan.
2. Sorting/filtering happens client-side over the same payload to keep
   the UI snappy; the route caps results at 1000 jobs.
3. "Rescore all" runs in-memory + persistence under one button; if
   `role_fit_scores` is missing the route degrades gracefully.

### Phase 7 — RocketReach contact intelligence

**Inspected**
- Existing routes that call RocketReach directly: `find-email`,
  `find-leads`, `backfill-emails`, `batch-research`, `research-contacts`,
  `cron/research`. Each builds its own request and parses its own
  response. The Phase 7 work adds a typed adapter without touching
  these legacy paths.

**Changed**
- `src/lib/contactProviders/types.ts` — `NormalizedContact`,
  `ContactProvider`, `ContactSearchInput`, `ContactSearchResult`.
  Enumerates `ContactRoleType` and `ContactSeniority`.
- `src/lib/contactProviders/heuristics.ts` — `categorizeRoleType`,
  `categorizeSeniority`, `detectMinesAlumni`, `detectPossiblePE`,
  `emailConfidenceFromGrade`, `emailConfidenceFromValidation`.
- `src/lib/contactProviders/rocketreach.ts` — RocketReach v2 search
  adapter that builds the `current_employer` + `current_title` query
  for the prompt's target titles, then runs the heuristics on each
  profile. Returns `[]` with a clean error when the API key is missing.
- `src/lib/contactProviders/mock.ts` — deterministic 4-person seed
  (mix of EM/Director/Principal/Recruiter, mix of Mines/PE flags) for
  use in tests and pre-credentials environments.
- `src/lib/contactProviders/registry.ts` — `getContactProvider()`
  prefers RocketReach when configured; falls back to mock.
- `supabase/migrations/0003_contacts_enrichment.sql` — additive
  columns on `contacts`: `role_type`, `seniority`, `department`,
  `is_mines_alumni`, `is_possible_pe`, `email_confidence`,
  `linkedin_url`, `provider_person_id`, `provider_source`,
  `verified_at`, `last_enriched_at`. Plus indexes.
- `src/app/api/contacts/enrich-company/route.ts` — POST `{
  companyname | company_id, domain?, role_targets?, limit?, dry_run?,
  prefer_provider? }` that runs the active provider, dedupes by
  `provider_person_id` → `(companyname, email)` → `(companyname,
  full_name)`, and upserts.
- `scripts/contact-heuristics.test.mjs` — 21 cases for role,
  seniority, Mines, and PE detection.

**Tests / checks**
- `node scripts/contact-heuristics.test.mjs` → 21 passed, 0 failed.
- `npx tsc --noEmit` → clean (after extracting `CompanyRow` type for
  the same widening issue Phase 4 ran into).

**Result**
- Any company in the sandbox can now be enriched through one route.
  Without RocketReach credentials the mock fills in deterministic
  seed contacts so Phases 8 and 10 always have something to render.
- The existing direct-RocketReach routes remain untouched and
  authoritative for their flows.

**Remaining work**
- Phase 8 templates pick the best contact per recommended action
  using `role_type`, `is_mines_alumni`, and `is_possible_pe`.
- A future cleanup can migrate the legacy RocketReach calls onto the
  new adapter so they share the heuristics, but that's out of scope
  here.

**Assumptions made**
1. RocketReach Person Search v2 endpoint shape (`POST /api/search`
   with `query.current_employer/current_title`, `page_size`) is
   stable. The existing routes call it the same way.
2. "Best email" is the one with the highest grade (verified > A > B
   > C > D > F), matching how the existing routes treat grades.
3. PE detection is intentionally lenient — a title like "John, P.E."
   is enough; the UI labels these `is_possible_pe` rather than
   `is_pe` to acknowledge the recall/precision tradeoff.

### Phase 8 — Outreach drafts and action queue

**Inspected**
- Existing letter draft flow on `reachout_company_inserts` — left
  untouched. The new tables sit alongside it and Phase 8/9 work writes
  to them so the legacy flow keeps printing.
- `runtimeEnvironment.portfolioUrl` (defaults to
  `https://kohler.solokit.app`) and `resumeUrl` (env-driven).

**Changed**
- `supabase/migrations/0004_outreach_workflow.sql` — additive tables
  `outreach_campaigns`, `outreach_actions`, `email_drafts`, `letters`,
  `applications`, plus indexes on status / company / job / thread.
- `src/lib/outreach/templates.ts` — six template renderers with a
  shared `OutreachContext`:
    1. `active_job_em` — engineering manager intro for an active job
    2. `active_job_recruiter` — recruiter follow-up after applying
    3. `company_intro` — exploratory note when no current job
    4. `mines_alumni` — Mines-to-Mines intro
    5. `pe_track` — EIT/PE-track intro
    6. `physical_letter` — formal printed letter
  Each renders subject + body_text + body_html with the candidate
  signature, portfolio URL, and résumé link. Fit summary and matched
  skills are spliced in when available. `pickTemplate(...)` maps
  `recommended_action` → `TemplateKey`.
- `src/app/api/outreach/create-draft/route.ts` — POST that resolves
  company / contact / job, picks the best template, renders, and
  inserts into `outreach_actions` (+ `email_drafts` or `letters`).
- `src/app/api/outreach/approve-draft/route.ts` — sets
  `email_drafts.status = 'human_approved'` and
  `outreach_actions.status = 'human_approved'`. Optionally accepts
  edited subject/body so the human edit lands in the same row.
- `src/app/api/outreach/actions/route.ts` — GET list of outreach
  actions with status/companyname filters.
- `src/app/api/applications/mark-applied/route.ts` — POST that writes
  to `applications` and updates the linked outreach action to 'sent'.
- `scripts/templates.test.mjs` — 9 cases for `pickTemplate` routing.

**Tests / checks**
- `node scripts/templates.test.mjs` → 9 passed, 0 failed.
- `npx tsc --noEmit` → clean (after extracting `ContactRow` and
  `JobRow` named types — same widening fix as Phases 4 and 7).

**Result**
- A draft can be created from any (company, contact, job) tuple in one
  POST. The renderer always includes the portfolio link and a clear
  signature; PE/Mines variants are rendered when relevant.
- Drafts default to `status="draft"`; nothing leaves the system until
  Phase 9 sends an approved draft.

**Remaining work**
- Phase 9 plugs `email_drafts` rows into Gmail (draft create + live
  send when ENABLE_LIVE_SEND=true) and links `gmail_thread_id` /
  `gmail_message_id` back to the draft row.
- A future UI page can render outreach actions and let the human
  approve / edit drafts inline; for now the routes are usable from
  the command center via the contact/company panels.

**Assumptions made**
1. The default candidate is hardcoded as Kohler Wood with the Mines /
   EIT signature; future support for multiple candidate profiles can
   thread `candidate_profile_id` through the renderer.
2. `pickTemplate` falls back to `company_intro` for `monitor` / `skip`
   / unknown actions so the UI never crashes when an action lacks a
   template.
3. `applications` rows mark the linked outreach action as 'sent' to
   keep the funnel coherent — adjustable later if Kohler wants
   "applied without outreach" tracked separately.

### Phase 9 — Gmail send/draft + reply backfill

**Inspected**
- `src/lib/googleAuth.ts` — `getAuthedGmailClient()` already loads the
  Gmail account row, refreshes the access token, and returns a
  `googleapis` Gmail client. Phase 9 wraps it for both draft creation
  and reply backfill.
- `src/app/api/ingest/ziprecruiter/route.ts` — confirmed the same
  Gmail client style is used for inbound history sync.

**Changed**
- `supabase/migrations/0005_email_messages.sql` — additive tables
  `sent_messages`, `email_threads`, `email_messages` plus indexes on
  thread_id, contact_email, classification, direction.
- `src/lib/gmail/replies.ts` — `classifyReply({subject, snippet,
  body_text, from_email})` returns
  `{classification, confidence, signals}` over nine categories
  (positive_reply, recruiter_screen, apply_online, referral,
  needs_follow_up, rejection, bounce, out_of_office, auto_reply,
  unknown). Sender-domain hints add weight for ATS / no-reply senders.
- `src/lib/gmail/draft.ts` — `dispatchGmailMessage({message, mode})`
  handles `draft` / `send` / `dry_run` modes. `pickSendMode` returns
  `send` only when explicit + draft is `human_approved` AND
  `ENABLE_LIVE_SEND === "true"`. Builds proper multipart MIME with
  RFC 2047-encoded subject and base64url payload.
- `src/app/api/gmail/create-draft/route.ts` — POST `{ draft_id, mode? }`
  pulls the draft row, dispatches via Gmail API, updates
  `email_drafts.status` (`gmail_drafted` or `sent`), and inserts a
  `sent_messages` row. Updates the linked outreach action to `sent`
  on a real send.
- `src/app/api/gmail/send-approved/route.ts` — convenience wrapper
  that hard-fails with 403 unless `ENABLE_LIVE_SEND=true`.
- `src/app/api/gmail/backfill-responses/route.ts` — POST `{ start_date,
  end_date, candidate_email, query, max_messages, dry_run }` runs the
  Gmail message search, dedupes by `gmail_message_id`, classifies each
  message, links replies to existing `email_drafts.gmail_thread_id`,
  and writes `email_threads` + `email_messages`. Marks threads
  `needs_action=true` for positive_reply / recruiter_screen /
  needs_follow_up / referral.
- `src/app/api/gmail/sync-incremental/route.ts` — cron-friendly
  wrapper that calls backfill-responses with `newer_than:7d` and
  `max_messages=50`.
- `scripts/reply-classification.test.mjs` — 11 cases across all
  categories.

**Tests / checks**
- `node scripts/reply-classification.test.mjs` → 11 passed, 0 failed.
- `npx tsc --noEmit` → clean.

**Result**
- Drafts created via `/api/outreach/create-draft` can now be promoted
  to Gmail drafts in one POST. Live send is blocked unless the
  ENABLE_LIVE_SEND gate is set AND the draft is human_approved.
- Historical Gmail traffic can be backfilled into `email_threads` /
  `email_messages` with classifications, so the response-rate
  dashboard (Phase 10) has data to render.

**Remaining work**
- A future polish: store the full body (not just snippet) when
  classification confidence is below a threshold so a human reviewer
  can re-read the message. Out of scope for this commit.
- A scheduled cron entry in `vercel.json` can call
  `/api/gmail/sync-incremental` once a day; left for the production
  promotion plan to add.

**Assumptions made**
1. `ENABLE_LIVE_SEND` is treated as case-insensitive `"true"` — any
   other value (including `"True"` is fine, but `"1"` is not).
2. `email_threads.gmail_thread_id` is unique. Re-runs of the backfill
   route therefore update the existing row instead of inserting.
3. Reply classification is a heuristic by design; the dashboard can
   later switch to an LLM-backed scorer using the same
   `classifyReply` shape so the call sites don't change.

### Phase 10 — Metrics dashboard

**Inspected**
- All Phase 3-9 tables (`job_listings`, `role_fit_scores`,
  `email_drafts`, `sent_messages`, `email_threads`, `email_messages`,
  `applications`, `outreach_actions`) — confirmed counts can be done
  with `head:true, count:exact` queries.

**Changed**
- `src/app/api/metrics/overview/route.ts` — single GET endpoint that
  returns `headline` (15 KPI counts), `classifications` (inbound
  reply breakdown), and `table_status` (per-table availability so the
  UI can prompt for missing migrations). Each query is wrapped so
  missing tables degrade to 0 rather than 500.
- `src/app/dashboard/page.tsx` — KPI grid with 15 tiles plus an
  inbound-classification table and migration-status checklist.
- `src/components/Nav.tsx` — added Dashboard as the first nav link.

**Tests / checks**
- `npx tsc --noEmit` → clean (after refactoring the count helpers
  to take typed `PromiseLike` thenables instead of trying to chain
  filters through a generic helper).

**Result**
- `/dashboard` answers: companies tracked, companies w/ open roles,
  high-fit jobs, jobs w/ PE signal, drafts in progress / approved,
  emails sent or drafted, replies received, positive replies,
  recruiter screens, follow-ups due, applications submitted, response
  rate, positive response rate. Each tile is computed from real
  Supabase counts.

**Remaining work**
- Per-company timelines (jobs found → contacts found → draft → sent →
  reply → application → follow-up) are deferred — the data is in
  place via `outreach_actions` + `email_threads`, but rendering them
  is left as a Phase 13+ improvement.
- An "auto-refresh" toggle would make the dashboard a true command
  center; currently it fetches once on mount.

**Assumptions made**
1. `response_rate = inbound_total / sent_messages`. If `sent_messages`
   is zero, both rates are zero.
2. "Follow-ups due" sums `email_threads.needs_action=true` plus
   inbound classifications equal to `needs_follow_up`.
3. Migration-status checks treat "table exists with 0 rows" as
   `applied`; only `does not exist` errors mark it `missing`.

### Phase 11 — Verification & self-evaluation

**Inspected**
- All test scripts under `scripts/*.test.mjs`.
- Output of `npx tsc --noEmit`.
- Each Phase 2-10 commit's deliverables against the prompt's
  acceptance criteria.

**Changed**
- `docs/verification-report.md` — full report. Q1/Q2/Q3 working,
  Q4/Q5 partial. Includes the next-improvement column and the
  migration/env requirements for promoting "partial" → "working".

**Tests / checks**
- All seven test suites: 94 passes / 0 failures (10 + 19 + 14 + 10 +
  21 + 9 + 11).
- `npx tsc --noEmit` → clean.
- `next build` deliberately not run — requires real Supabase env
  vars not set in this sandbox.

**Result**
- Sandbox has end-to-end paths from job ingest → fit scoring → contact
  enrichment → draft → Gmail draft → reply backfill → metrics.
- Three of five product questions are fully answered today; the
  remaining two are partial because (a) legacy contact routes still
  write the old contact shape and (b) one-click "create draft" from
  the command-center isn't wired in the UI yet.

### Phase 12 — Production promotion plan

**Inspected**
- All five new migrations to confirm they're additive.
- All new env vars referenced by the new code.
- All new and modified routes / pages.

**Changed**
- `docs/production-promotion-plan.md` — full release path. Includes
  per-commit table, migration order, env-var requirements, smoke-test
  checklist, data-validation queries, rollback path, and the open
  follow-ups for the next agent run.

**Result**
- A release manager can apply migrations 0001-0005, set the new env
  vars (none required), deploy, run the eight-step smoke checklist,
  then choose when (if at all) to flip `ENABLE_LIVE_SEND=true`.
- All work is reversible without data loss.

### Final session summary

**Completed work**
- 11 commits across Phases 1-12 (Phase 1+2 combined).
- 5 additive Supabase migrations.
- 15 new API routes.
- 2 new pages (`/command-center`, `/dashboard`) plus global Nav mount.
- Job-source adapter framework (Greenhouse, Lever, Ashby + manual,
  mock).
- Contact provider framework (RocketReach + mock).
- Gmail draft / send / backfill / classification.
- 7 test suites, 94 cases, all passing.
- `getRuntimeEnvironment()` + diagnostics route + always-on env
  badge.

**Files changed**
- 23 new TypeScript files, 5 new SQL migrations, 7 new test scripts,
  5 docs (`sandbox-current-state`, `architecture`, `agent-run-log`,
  `verification-report`, `production-promotion-plan`).
- Modified: `package.json` (typecheck/test scripts), `src/app/layout.tsx`
  (mounted Nav + EnvironmentBadge), `src/components/Nav.tsx` (added
  Dashboard + Command-center links).

**Checks run**
- `npx tsc --noEmit` (clean).
- All 7 `.test.mjs` suites (94/94 passing).

**Remaining gaps (handed off to next session)**
- Migrate legacy `/api/find-email`, `/api/research-contacts`,
  `/api/cron/research` onto `getContactProvider()`.
- Wire one-click "Create draft" buttons in command-center rows.
- Add per-company funnel timeline to dashboard.
- Hook `persistNormalizedJobs` to score jobs on insert.
- Add `vercel.json` cron entry for `/api/gmail/sync-incremental`.

**Next Codex prompt**

> ⚠️ **Superseded.** The next-session prompt is in
> `docs/SESSION_HANDOFF_NEXT.md` after the schema audit.

### Phase 1 (REDONE) — Live Supabase schema audit

**Why this section exists**
- The original Phase 1 was a grep-based inventory of the application
  code. It produced `docs/sandbox-current-state.md`, which captured the
  shape of the *application* but not of the *database*.
- The user flagged this as a load-bearing problem before it caused a
  production incident: scaffolded migrations on parallel-universe schema.
- Phases 2-10 of this session were all built on top of that
  parallel-universe schema. Several routes and helpers will fail against
  the live database. They are still committed and useful as design
  intent, but the next session must reconcile them.

**Inspected (live, via Supabase MCP)**
- Project `acwgirrldntjpzrhqmdh` (KOHLER OS, postgres 17, us-west-2,
  status ACTIVE_HEALTHY). Confirmed via `list_organizations`,
  `list_projects`, `get_project`.
- `list_tables` verbose for the public schema — 33 tables.
- `execute_sql` against `pg_indexes`, `pg_constraint`, and
  `query_to_xml`-based row counts.
- `list_migrations` — 30 applied (naming `YYYYMMDDHHMMSS_name`).
- `list_extensions` — `pg_cron`, `pg_net`, `pgvector`, `pgcrypto`,
  `uuid-ossp`, `pg_stat_statements`, `hypopg`, `index_advisor`,
  `supabase_vault`, `pg_graphql` are all installed.
- `get_advisors security` — flags 6 SECURITY DEFINER views (ERROR), 14
  RLS-disabled public tables (ERROR), 3 always-true RLS policies (WARN),
  7 mutable function search_paths (WARN), `vector` extension in
  public (WARN), and leaked-password protection disabled (WARN).
- `pg_views` definitions for the six SECURITY DEFINER views
  (`relevant_roles`, `tier_1_4_contacts`, `reachout_final_letters`,
  `pile_a_with_jobs`, `pile_a_relevant_jobs`, `pile_b_no_jobs`).
- `env_vault` keys (project=`kohler-outreach`, 12 entries) — confirms
  this database IS the live one for the app.

**Changed**
- Created `docs/supabase-schema-baseline.md` — full live schema dump for
  every table the outreach pipeline touches, plus diff vs. each draft
  migration and a "code that will fail" list.
- Quarantined `supabase/migrations/0001..0005_*.sql` to
  `supabase/migrations/_drafts/*.sql.draft` so no migration runner
  picks them up.
- Wrote `supabase/migrations/_drafts/README.md` explaining each
  collision and the rules for the next session's reconciliation.
- Marked the prior verification-report status of "Q1/Q2/Q3 working" as
  optimistic — the runtime tests passed but the routes would fail
  against the live database. See updated verification-report.md.

**Tests / checks**
- All 94 unit-test cases still pass (they don't touch Supabase). The
  failure mode is at runtime against live tables.
- No new tests added in this audit step — the audit is observational.

**Result**
- Next session has a deterministic source of truth for every column,
  index, and constraint it needs to reckon with.
- The five draft migrations sit safely outside the migration runner.
- The most surprising finding: `role_fit_scores` already exists in
  production with **273 rows of data**, written by an out-of-band SQL
  that bypassed the migration log. Same story for `outreach_actions`,
  `job_sources`, `sync_runs`. The grep-based inventory had no way to
  see these.

**Remaining work — handed to next session**
- See `docs/SESSION_HANDOFF_NEXT.md`. One reconciled migration per
  session, in the order suggested there.

**Assumptions made**
1. KOHLER OS (`acwgirrldntjpzrhqmdh`) is the live database for
   `kohler-outreach`. Verified by `env_vault` rows for project
   `kohler-outreach` containing `KOHLER_SUPABASE_URL`/`KOHLER_SUPABASE_KEY`.
2. The separate Supabase project `nwsjgppkfducaikxsyvk` named
   "Kohler Outreach Sandbox" is NOT the live database for this app.
   Reconciliation here targets KOHLER OS only.
3. Out-of-band tables (`role_fit_scores` etc.) reflect intentional
   prior work, not corruption — reconciliation should preserve their
   schema, not replace it.
4. Security advisors (RLS, SECURITY DEFINER views, mutable
   search_path) are documented but **out of scope** for this session.
   Touching them risks breaking the existing app; they belong on the
   security backlog.

### Session A — `sync_runs` helper reconciled, smoke-tested live

**Inspected**
- Re-introspected `sync_runs` and `companies` shape via
  `mcp__…__list_tables verbose=true` (no drift since the audit).
- Confirmed `acwgirrldntjpzrhqmdh` (KOHLER OS) is what the local app
  hits via `KOHLER_SUPABASE_URL` in `.env.local`.

**Changed**
- Rewrote `src/lib/syncRuns.ts` end-to-end to match the live schema:
  - `SyncRunHandle.id: string | null` (uuid, was `number`).
  - `SyncRunCounts` uses camelCase `companiesChecked`, `jobsFound`,
    `jobsRelevant`, `jobsInserted`, `jobsUpdated`, `jobsSkipped` —
    no `closed`, no `int errors count`.
  - `SyncRunExtras` introduces `errors: string[]` (jsonb array) plus
    `warnings`, `result`, `errorText` which fold into the live
    `metadata jsonb` column (those columns don't exist as their own).
  - `startSyncRun` now accepts `provider`, `companyname`,
    `triggerType`, `dryRun`, and writes the live column names.
  - Added `normalizeSyncRunStatus("partial") → "completed_with_errors"`
    so existing call sites can migrate gradually if needed.
- Patched `src/app/api/jobs/sync-source/route.ts`:
  - passes `provider`, `companyname`, `triggerType`, `dryRun` at
    `startSyncRun` time;
  - status mapping replaces `"partial"` with the live enum value
    `"completed_with_errors"`;
  - counts pass `companiesChecked: 1, jobsFound, jobsInserted,
    jobsUpdated, jobsSkipped`;
  - errors pushed as the `errors` jsonb array (was an int count).
- Patched `src/app/api/jobs/sync-all/route.ts` analogously, plus
  tracks `companiesChecked` and `jobsFound` running totals through
  the loop so the live counters get accurate values.
- Patched `src/app/api/runtime-diagnostics/route.ts` to:
  - read `jobs_inserted` / `jobs_updated` (live names) before falling
    back to the older int-named columns;
  - count `errors` from the jsonb array length, not as an int field;
  - treat `completed_with_errors` as a successful run for
    `lastSuccessfulIngestAt` purposes.

**Tests / checks**
- `npx tsc --noEmit` → clean.
- All 7 unit-test suites pass: 94/94. (No new tests added — Session
  A is a schema-shape fix, not a logic change. Future Session A+
  could add a `sync-runs.test.mjs` mocking the supabase client.)
- **Live smoke test** (against KOHLER OS):
  ```bash
  POST /api/jobs/sync-source
    { source_type: "mock_ats", company_id: 7, dryRun: true }
  → 200 { ok: true, dryRun: true, adapter: "mock_ats",
          company: "PAE Consulting Engineers", fetched: 2, … }
  ```
  Resulting row in `sync_runs`:
  ```json
  {
    "id": "82afeeea-ba54-4b62-bff4-f7bb0f3eff14",
    "source_type": "mock_ats",
    "provider": "mock_ats",
    "companyname": "PAE Consulting Engineers",
    "status": "completed",
    "trigger_type": "manual",
    "dry_run": true,
    "duration_ms": 129,
    "companies_checked": 1,
    "jobs_found": 2,
    "jobs_inserted": 0,
    "jobs_updated": 0,
    "jobs_skipped": 2,
    "errors": [],
    "metadata": { "result": { "dryRun": true, "fetched": 2 } }
  }
  ```
- `/api/runtime-diagnostics` now returns
  `ingest.runsTable = "sync_runs"` (was falling back to
  `job_ingest_runs`) and surfaces the row above as `latestRun` and
  `lastSuccessfulIngestAt`. Env badge will display this when
  expanded.

**Result**
- Adapter sync runs are now persisted correctly to KOHLER OS.
- The `partial` status bug is gone — live enum value
  `completed_with_errors` is used.
- Env badge / dashboard surface real-time sync metadata.

**Remaining work**
- Session B (next): reconcile `role_fit_scores` upsert in
  `src/app/api/jobs/rescore/route.ts`. Live unique key is
  `(job_listing_id text, score_version)`, not `(job_id,
  candidate_profile_id)`. 273 rows of existing data must not be
  lost.
- Drive-by finding flagged for Session D: runtime-diagnostics warned
  `column job_listings.date_posted does not exist` — the live column
  is `posted_date`. Trivial one-line fix; bundling it into Session D
  (job_listings provenance) since that's the context.

**Assumptions made**
1. `metadata.params/result/warnings/error_text` is the right place
   for the data the prior helper had as separate columns. Reasonable
   because none of those columns exist on live `sync_runs`.
2. The dry-run row with `companyname="PAE Consulting Engineers"`
   left in `sync_runs` is fine to keep as a verification artifact.
   It's `dry_run=true`, so no `job_listings` rows were created.
3. CRON_SECRET isn't in env_vault for `kohler-outreach`, so
   `requireCronSecret` returns null in dev — fine; cron-auth path
   is exercised separately in production.

### Session B handoff

**Goal:** make `src/app/api/jobs/rescore/route.ts` upsert into the
live `role_fit_scores` table without losing the 273 existing rows.

**Live shape (verified 2026-05-14):**
- PK: `id uuid`
- Identity: `(job_listing_id text, score_version text)` UNIQUE
- Columns the route must populate: `companyname`, `source`,
  `external_job_key`, `score_version` (default `'kohler-fit-v1'`),
  the six sub-scores, `overall_score`, `recommended_action` (check
  enum already matches Phase 5 design), `explanation_summary text`,
  `explanation_json jsonb`.
- Note: `job_listing_id` is **text**, not int. Stringify
  `job_listings.id` when writing.

**Code changes needed:**
1. `src/app/api/jobs/rescore/route.ts`:
   - Drop the `candidate_profile_id` field from the upsert payload.
   - Change `onConflict: "job_id,candidate_profile_id"` →
     `onConflict: "job_listing_id,score_version"`.
   - Rename `job_id` → `job_listing_id` and stringify the int:
     `String(jobRow.id)`.
   - Add `score_version: "kohler-fit-v1"`.
   - Add `companyname`, `source`, `external_job_key` from the
     joined job_listings row.
   - Optionally add `explanation_summary` derived from
     `explanation_json.notes.join("; ")`.

**No migration needed.** Table already exists with all required
columns.

**Smoke test plan:**
1. `select count(*) from role_fit_scores where score_version =
   'kohler-fit-v1';` should return 273 before any writes.
2. Run `POST /api/jobs/rescore { job_id: <one of the 383 job_listings
   ids>, dry_run: true }` first to inspect the computed score.
3. Run again without `dry_run` and confirm the row is upserted (count
   stays the same if already present, increments by 1 if new).
4. Spot-check one or two rows for `score_version = 'kohler-fit-v1'`
   and verify the sub-score values match what `scoreJobForKohler`
   produces in the unit test.

**Open question for Session B (decide & document, do not block):**
Should the new code REPLACE the 273 existing rows (re-score all of
them with the current algorithm) or LEAVE them and only score new
rows? The safe call: leave them alone unless a `force_rescore=true`
flag is passed. That preserves existing scores Kohler may have used
to make decisions. Bulk re-score becomes its own conscious action.

> **Resolved by user 2026-05-14:** preserve old scores. Strategy:
> bump `score_version` from `kohler-fit-v1` (the 273 existing rows)
> to `kohler-fit-v2` for any new write. Old rows stay forever as
> historical record; the unique key `(job_listing_id, score_version)`
> guarantees no overwrite. Confirmed all 273 rows are
> `score_version='kohler-fit-v1'`.

### Session F — Gmail reply ingestion live (jumped ahead of B-E)

**Why jumped:** user prioritized the "stop manually logging Gmail
replies" workflow above fit scoring / contact enrichment / etc.
Sessions B–E are still scoped in the original handoff plan; F just
moved up the queue.

**Inspected**
- Re-introspected `email_threads`, `email_messages`, `sent_messages`
  via `list_tables` — all three absent in KOHLER OS, no out-of-band
  collision risk.
- Verified `gmail_accounts` has 1 row for `317lrw@gmail.com` with a
  refresh_token and a populated `last_history_id` cursor. Production
  cron uses this account; local dev cannot (see "Known limit"
  below).
- Confirmed all 273 existing `role_fit_scores` rows are
  `score_version='kohler-fit-v1'` — clears the path for Session B
  to use `v2` cleanly.

**Applied** (via `mcp__…__apply_migration`)
- `add_email_messages_for_gmail_reply_ingest` migration. Reconciled
  from the draft to match live FK column types:
  - all PKs `uuid` (matches role_fit_scores / outreach_actions /
    job_sources / sync_runs convention)
  - `outreach_action_id` is `uuid REFERENCES outreach_actions(id)`
  - `contact_id` is `integer REFERENCES contacts(id)`
  - `job_listing_id` is `integer REFERENCES job_listings(id)`
    (renamed from draft's `job_id` for consistency)
  - `email_draft_id` is `uuid` with NO FK (added in Session E when
    `email_drafts` ships)
  - added `email_messages_inbound_action_idx` partial index for the
    dashboard's "show me follow-ups due" query
  - added `last_message_at desc` and `internal_date desc` indexes
    for chronological views

**Changed**
- `src/app/api/gmail/backfill-responses/route.ts`:
  - `emailThreadId: number | null` → `string | null` (uuid)
  - all `id` casts updated for uuid
  - `email_drafts` lookup wrapped in try/catch — gracefully skips
    when the table is missing (still missing pre-Session E)
  - factored `needsActionClassifications` into a Set
  - thread insert error now surfaces in `summary.warnings` (was
    silently swallowed)
- `src/app/api/gmail/sync-incremental/route.ts`:
  - default query: `in:inbox newer_than:7d` → `newer_than:2d`
  - default max_messages: 50 → 100
  - exports `GET` in addition to `POST` so a healthcheck doesn't 405
  - explicit `maxDuration = 60` for Vercel cron tier
- `vercel.json`:
  - added cron: `/api/gmail/sync-incremental` daily at `0 14 * * *`
    UTC (= 8am MST), aligns with the existing `cron/research`
    schedule (8am UTC) and pg_cron ZipRecruiter (`14:00 UTC`)
- `src/app/api/replies/list/route.ts` (new):
  - GET that joins `email_messages` (inbound only) + `email_threads`
  - filter params: `classification`, `needs_action_only`, `limit`
  - returns per-classification breakdown so the UI can render tab
    counts
  - graceful "table missing" warning if migration hasn't shipped
- `src/app/replies/page.tsx` (new):
  - 11 classification filter chips with live counts
  - "Sync now" button that hits `/api/gmail/sync-incremental`
    on demand
  - per-message card: classification pill, "action needed" badge,
    company name, subject, sender, snippet, "Open in Gmail ↗"
    link
  - `formatTimestamp` shows "today X:XXpm", "yesterday", "Nd ago"
- `src/components/Nav.tsx`: added `Replies` link between
  Command center and Open Roles.

**Drive-by fixes (per "work recursively" directive)**
- `src/app/api/runtime-diagnostics/route.ts`: corrected
  `job_listings.date_posted` → `posted_date` (live column name) and
  swapped non-existent `last_seen` → `last_seen_at` and
  non-existent `created_at` → `received_at` / `fetched_at`. This
  resolves the warning that was appearing on every env-badge open.

**Tests / checks**
- `npx tsc --noEmit` → clean.
- `GET /api/replies/list` against empty `email_messages` →
  `200 { ok: true, count: 0, breakdown: {} }`. No "table missing"
  warning, which confirms the migration is live.
- `GET /replies` page → `200`, renders empty state + filter chips
  + "Sync now" button.

**Known limit (production-only path works)**
- Local Gmail smoke test fails with `gmail auth: invalid_request`
  because `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` aren't in
  `env_vault` — they live only on the existing Vercel project. The
  production deploy of this code will work because Vercel has those
  secrets. To enable local testing in a future session, ask the user
  to drop them into env_vault under project `kohler-outreach`.
- Until production deploy, the `/replies` page will show "No replies
  in this category yet. Click 'Sync now' to pull from Gmail." —
  empty state is correct.

**Result**
- Schema is in place: any reply landing in 317lrw's Gmail inbox can
  be classified and stored.
- The "stop manually logging" loop closes once production deploy
  exists: daily cron runs at 8am MST, classifies the previous day's
  replies, updates the `/replies` page and the `/dashboard`
  "follow-ups due" tile.
- Existing legacy outreach data (210 `reachout_company_inserts`
  rows, 1330 `tracking` rows, 843 `contacts`) is untouched — these
  are NEW tables alongside.

**Remaining work**
- Production deploy of this branch (gated on the new Vercel project
  setup we discussed earlier).
- Drop `GOOGLE_CLIENT_ID/SECRET` into env_vault if local Gmail
  testing is wanted in future sessions.
- Session E (when it runs) will add `email_drafts` + a FK from
  `sent_messages.email_draft_id`. Backfill route's email_drafts
  lookup will then start linking replies to outreach actions
  automatically — no further code change needed in F.
- Session B (next): bump `score_version=kohler-fit-v2`, fix
  `/api/jobs/rescore` upsert. 273 v1 rows preserved as historical
  record.

### Session G handoff (Session B is the next reconciliation)

**Pick the next reconciliation by priority:**
- **Session B (`role_fit_scores`):** highest user-facing value
  after F. Makes "Rescore all" on `/command-center` actually work.
- **Session C (`contacts` enrichment):** lights up `is_mines_alumni`
  / `is_possible_pe` / `role_type` columns on the contacts table —
  helps Phase 8 templates pick the right contact.
- **Session D (`job_listings` provenance gap):** adds `source_url`,
  `normalized_hash`, `closed_at`. Smallest scope.
- **Session E (`outreach_actions` + new tables):** unlocks Phase 8
  draft creation + retroactively links email_threads → outreach
  actions in F's backfill.

**Recommended next: Session B.** Reasons:
1. Now that the 273-row preservation strategy is locked in (bump to
   v2), it's a straightforward edit.
2. `/command-center` "Rescore all" button is the most-clicked write
   in the new UI.
3. After B, all three "currently live" Claude sandbox features
   (command-center, dashboard, replies) round out cleanly.

**Session B detailed prompt** is already in this run log under
"Session B handoff" earlier — no new prompt needed.
