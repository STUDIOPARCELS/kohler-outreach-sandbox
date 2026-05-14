# Session Handoff — Reconciliation against KOHLER OS

> **Read first:** [`docs/supabase-schema-baseline.md`](supabase-schema-baseline.md).
> Your only job is to bring the application code into alignment with that
> baseline, one migration at a time. Each session does ONE reconciliation
> and stops. Do not start the next one in the same context.

## Ground rules

1. **Live schema is truth.** Before touching a migration or a
   route, query the database via the Supabase MCP. Do not trust the
   migration log alone — four production tables (`role_fit_scores`,
   `outreach_actions`, `job_sources`, `sync_runs`) were created
   out-of-band and do not appear in `supabase_migrations.schema_migrations`.

2. **Project ID is `acwgirrldntjpzrhqmdh` (KOHLER OS).** Confirm with
   `mcp__…__get_project` before applying any migration. The separate
   `nwsjgppkfducaikxsyvk` (Kohler Outreach Sandbox) is NOT this app's
   live database.

3. **Additive only.** `add column if not exists`,
   `create table if not exists`. No drops. No renames. No constraints
   that existing data would violate.

4. **One reconciliation per session.** When done, write your own tight
   handoff prompt and stop. Do not chain.

5. **Match the existing migration naming convention** when promoting:
   `YYYYMMDDHHMMSS_short_name.sql` in `supabase/migrations/` (NOT
   `_drafts/`). Apply via `mcp__…__apply_migration`.

6. **Update calling code in the same commit** as the migration.
   Tests must compile and pass. Add at least one Supabase-integration
   smoke test per route you touch.

## Reconciliation order (one per session)

### Session A — `sync_runs` + `syncRuns.ts` helper

Lowest-risk because the table has 0 rows. Reconcile column names so
Phase 4 sync routes can write valid records.

- **Live shape:** see baseline §`sync_runs`. Key columns the helper
  needs: `provider`, `source_type`, `companyname`, `status`
  (enum: `running, completed, completed_with_errors, error,
  skipped`), `trigger_type`, `dry_run`, `started_at`, `finished_at`,
  `duration_ms`, `companies_checked`, `jobs_found`, `jobs_relevant`,
  `jobs_inserted`, `jobs_updated`, `jobs_skipped`, `errors` (jsonb),
  `metadata` (jsonb).
- **Code to fix:** `src/lib/syncRuns.ts`,
  `src/app/api/jobs/sync-source/route.ts`,
  `src/app/api/jobs/sync-all/route.ts`,
  `src/app/api/runtime-diagnostics/route.ts` (the runs-table
  fallback already handles both names; just make sure the
  sync_runs branch reads the live columns).
- **Migration?** None needed if the table already has every column
  the helper writes. Verify with `list_tables verbose=true`. If a
  column is missing, add it additively.

### Session B — `role_fit_scores` + `kohlerFitScore.ts` integration

Highest-value because it has 273 rows of existing scores you must
not lose.

- **Live shape:** unique on `(job_listing_id text, score_version
  text)`. Has `companyname`, `source`, `external_job_key`,
  `explanation_summary text`, `explanation_json jsonb`,
  `score_version` (default `'kohler-fit-v1'`).
- **Code to fix:** `src/app/api/jobs/rescore/route.ts` upserts on
  the wrong conflict spec and writes `job_id` (column doesn't
  exist). Rewrite to upsert on `(job_listing_id, score_version)`,
  use the `kohler-fit-v1` version string, and stringify the
  job_listings.id when writing `job_listing_id`. Also produce
  `explanation_summary` from `explanation_json.notes`.
- **Migration?** None — table already exists and matches `RoleFitScore`
  intent.
- **Sanity check:** before any write, `select count(*) from
  role_fit_scores where score_version = 'kohler-fit-v1'`. Should be
  273. Confirm a sample of overall_score values to make sure the
  scoring distributions match what you'd produce.

### Session C — `contacts` enrichment

- **Live shape:** column is `contactname` (not `full_name`),
  `linkedin` (not `linkedin_url`). None of the enrichment columns
  (`role_type`, `seniority`, `is_mines_alumni`, `is_possible_pe`,
  `email_confidence`, `provider_person_id`, `provider_source`,
  `verified_at`, `last_enriched_at`) exist yet.
- **Migration:** apply `_drafts/0003_contacts_enrichment.sql.draft`
  almost as-is, but DROP the `linkedin_url` add (use existing
  `linkedin` column). Promote as
  `YYYYMMDDHHMMSS_add_contacts_enrichment.sql`.
- **Code to fix:** `src/app/api/contacts/enrich-company/route.ts`,
  `src/lib/contactProviders/{rocketreach,mock}.ts` —
  `NormalizedContact.full_name` → `contactname`,
  `NormalizedContact.linkedin_url` → `linkedin`.
- The legacy routes (`/api/find-email`, `/api/research-contacts`,
  `/api/cron/research`) write to `contacts.contactname` already;
  they just don't populate the new enrichment columns.

### Session D — `job_listings` provenance gap

- **Live shape:** has `apply_url`, `first_seen_at`, `last_seen_at`,
  `times_seen`, `is_relevant`, `match_score`, `relevance_reason`,
  `parser_version`, `ingest_status`, `raw_payload`, `gmail_message_id`,
  `external_job_key`. **Missing:** `source_url`, `normalized_hash`,
  `closed_at`.
- **Migration:** add only the three missing columns. Promote as
  `YYYYMMDDHHMMSS_add_job_listings_provenance.sql`.
- **Code to fix:** `src/lib/jobIngest/persist.ts` writes
  `source_url`, `normalized_hash` — those become valid after this
  migration. Do NOT write to `closed_at` from `persistNormalizedJobs`;
  it should be set only by a separate "mark closed" path.

### Session E — `outreach_actions` + Phase 8 workflow

The richest reconciliation because the live `outreach_actions`
schema is conceptually similar to my draft but uses different
column names.

- **Live `outreach_actions`:** `action_type` (12-value enum
  including `find_contacts, create_draft, mark_applied,
  follow_up`), `status` (5-value enum), `priority`, `due_at`,
  `completed_at`, `metadata jsonb`, `companyname`,
  `job_listing_id text`, `contact_id text`.
- **Code to fix:** `src/app/api/outreach/create-draft/route.ts`
  writes `template_key`, `channel`, `recommended_action`,
  `contact_id (bigint)` — none exist. Map onto
  `action_type=recommended_action`, push `template_key/channel`
  into `metadata jsonb`, cast `contact_id` to text.
- **Migration:** create the genuinely-new tables from
  `_drafts/0004` — `outreach_campaigns`, `email_drafts`,
  `letters`, `applications`. Drop the `outreach_actions`
  CREATE; the live one is canonical.
- Promote as `YYYYMMDDHHMMSS_add_outreach_drafts_and_funnel.sql`.

### Session F — `email_*` and `sent_messages`

Cleanest reconciliation — none of these tables exist yet.

- **Migration:** apply `_drafts/0005_email_messages.sql.draft`
  almost verbatim. Verify FK targets (`email_drafts(id)` from
  `sent_messages`) work after Session E.
- Promote as `YYYYMMDDHHMMSS_add_email_messages.sql`.
- **Code to fix:** none — `src/lib/gmail/draft.ts` and
  `src/app/api/gmail/*` route writes already match this draft's
  column names.

### Session G — Decide `job_positions` fate

`job_positions` (43 rows) is a parallel job table the prior session
missed. Decide:

- Merge into `job_listings` (one-time data migration), OR
- Keep both and update Phase 6 command-center to UNION them, OR
- Deprecate `job_positions` if it's no longer being written.

`grep -r "job_positions" src/` will show what code still uses it.
If nothing does, soft-deprecate (rename to `job_positions_archived`
in a follow-up session, or just leave it).

## Per-session boilerplate

When you open a reconciliation session, do exactly this:

1. Read `docs/supabase-schema-baseline.md` and `docs/agent-run-log.md`
   (latest section).
2. Confirm Supabase MCP works:
   `mcp__…__get_project id="acwgirrldntjpzrhqmdh"`.
3. Re-introspect the table you're touching:
   `mcp__…__list_tables verbose=true schemas=["public"]` and grep for
   the relevant table.
4. Diff against the draft and the calling code.
5. Write the migration in `supabase/migrations/`, write the code
   patch, run `npx tsc --noEmit` and `node scripts/*.test.mjs`.
6. **Apply the migration via `mcp__…__apply_migration`** to KOHLER OS.
7. Smoke-test by hitting one of the affected routes (use `dry_run`
   mode where possible).
8. Commit. Append a section to `docs/agent-run-log.md`. Update
   `docs/verification-report.md` to flip the relevant question(s) to
   "working" only if a live integration test passed.
9. Write your own one-paragraph "next session" hand-off and STOP.

## What NOT to do

- Do not touch `mc_*`, `policy_*`, `kv_store_*`, `reno_deals`,
  `companies_backup_20260304`. They belong to other products on the
  same database.
- Do not enable RLS on existing tables (security advisor flags). Wait
  for a dedicated security session — enabling RLS without policies
  will black-hole the app's existing reads.
- Do not change view definitions (`relevant_roles`,
  `tier_1_4_contacts`, etc.) without first confirming the consumers.
  The app reads `tier_1_4_contacts` as if it were a table.
- Do not apply migrations from `supabase/migrations/_drafts/`
  as-is. They are intent, not artefacts.

## When all six sessions are done

Update `docs/verification-report.md`:

- Q1-Q5 should each move from "partial" to "working" with a live
  integration test as evidence.
- Add a "production cutover" subsection listing the actual migration
  versions applied (the `YYYYMMDDHHMMSS` ones, not `0001..0005`).
- Re-run `get_advisors security` and document any new findings.

Then close the loop: open one final session whose only job is the
production cutover smoke test in `docs/production-promotion-plan.md`
§"Smoke test checklist".
