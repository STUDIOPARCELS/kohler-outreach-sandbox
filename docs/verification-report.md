# Verification Report — Kohler Outreach Engine

> **Updated 2026-05-14 after the live Supabase audit.** The original
> "Q1/Q2/Q3 working" status was optimistic — based on unit tests, not
> live integration. Several routes will fail against the live KOHLER OS
> database. See [`docs/supabase-schema-baseline.md`](supabase-schema-baseline.md)
> §"Code that will fail against live schema" for the exact list.

## Summary (post-audit)

| Status | Question |
| --- | --- |
| **partial** | Q1 — Which target companies have new roles? |
| **partial** | Q2 — Which roles fit Kohler best? |
| **partial** | Q3 — Which roles support his PE-track path? |
| **partial** | Q4 — Who is the best person to contact? |
| **partial** | Q5 — What is the next best action? |

Every previously-"working" answer drops to "partial" because the
underlying routes write column names that don't exist in production.
Unit tests still pass (94/94) but they verify pure logic, not
integration with live Supabase.

## What actually works today (verified)

- `npx tsc --noEmit` clean across the new code.
- All 7 unit-test suites pass: `runtime-environment` (10),
  `normalization` (19), `adapters` (14), `kohler-fit-score` (10),
  `contact-heuristics` (21), `templates` (9), `reply-classification`
  (11). Total: 94/94.
- The Phase 2 environment badge and `/api/runtime-diagnostics` route
  use Supabase queries that match live schema — these will work.
- The Phase 6 `/api/jobs/command-center` route reads `job_listings`,
  `companies`, `contacts`, `reachout_company_inserts` — all live
  tables with the expected columns. **This works.**
- The Phase 4 ATS adapters (Greenhouse / Lever / Ashby) are pure
  fetchers with no Supabase coupling — they work standalone.

## What does not work against live schema

| Route / module | Failure mode |
| --- | --- |
| `src/lib/syncRuns.ts` | `sync_runs` exists with different column names (`jobs_inserted`, `jobs_updated`, `jobs_skipped`, `errors jsonb`, `metadata jsonb`, `trigger_type`, `companies_checked`). Helper writes columns that don't exist; the warn-once fallback hides the error. |
| `src/app/api/jobs/sync-source/route.ts`, `sync-all/route.ts` | call the broken `syncRuns` helper; result is no `sync_runs` row written, but adapter persistence still works. |
| `src/lib/jobIngest/persist.ts` | writes `source_url` and `normalized_hash` to `job_listings` — neither column exists. INSERT fails. |
| `src/app/api/jobs/rescore/route.ts` | upserts `role_fit_scores` on `(job_id, candidate_profile_id)` conflict. Live unique key is `(job_listing_id text, score_version)`. Live `job_id` column doesn't exist (it's `job_listing_id text`). All upserts error. |
| `src/app/api/contacts/enrich-company/route.ts` | writes `full_name` to `contacts` (live column is `contactname`); writes `linkedin_url` (live is `linkedin`). Insert fails. |
| `src/app/api/outreach/create-draft/route.ts` | writes `template_key`, `channel`, `recommended_action`, `contact_id (bigint)` to `outreach_actions` — live has `action_type`, no `template_key/channel`, `contact_id` is text. Inserts into `email_drafts`/`letters` which don't exist yet. |
| `src/app/api/outreach/approve-draft/route.ts` | depends on `email_drafts`. |
| `src/app/api/gmail/create-draft/route.ts` | depends on `email_drafts` and `sent_messages`. |

## What's not committed yet (genuinely missing tables)

Listed in `_drafts/0004` and `0005`:

- `outreach_campaigns` — net new.
- `email_drafts` — net new.
- `letters` — net new (different from `reachout_company_inserts`).
- `applications` — net new.
- `sent_messages` — net new.
- `email_threads` — net new.
- `email_messages` — net new.

`role_fit_scores`, `outreach_actions`, `job_sources`, `sync_runs`
already exist with rows; reconciliation must use them as-is, not
recreate.

## Promotion path to flip every "partial" to "working"

1. Apply the next session's reconciled migrations in order
   (see `docs/SESSION_HANDOFF_NEXT.md`).
2. Patch the calling code listed above to match live column names.
3. Re-run unit tests + add at least one Supabase-integration smoke test
   per route that hits a real table.
4. Confirm `role_fit_scores` row count and `outreach_actions` enum
   values in the dashboard.

## Tests run this session

| Suite | Cases | Passed |
| --- | --- | --- |
| `runtime-environment.test.mjs` | 10 | 10 |
| `normalization.test.mjs` | 19 | 19 |
| `adapters.test.mjs` | 14 | 14 |
| `kohler-fit-score.test.mjs` | 10 | 10 |
| `contact-heuristics.test.mjs` | 21 | 21 |
| `templates.test.mjs` | 9 | 9 |
| `reply-classification.test.mjs` | 11 | 11 |
| **Total** | **94** | **94** |

Type-check: `npx tsc --noEmit` exits clean.

`next build` still not exercised (requires real env vars). No live
integration test was run against KOHLER OS in this session — that's
explicitly the next session's first job.
