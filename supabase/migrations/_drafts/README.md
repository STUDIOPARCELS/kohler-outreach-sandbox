# Draft migrations — DO NOT APPLY

These five SQL files were written in the prior session **before** the live
KOHLER OS schema was introspected. Each one collides with the live schema
in ways documented in [`docs/supabase-schema-baseline.md`](../../../docs/supabase-schema-baseline.md).

The `.sql.draft` extension keeps them out of any migration runner that
globs `*.sql` (Supabase CLI, `apply_migration` MCP tool, etc.).

| File | Why quarantined |
| --- | --- |
| `0001_provenance.sql.draft` | `job_sources` and `sync_runs` already exist in production with different columns (`provider`, `external_source_id`, `last_sync_run_id` on `job_sources`; `companies_checked / jobs_inserted / jobs_updated / jobs_skipped / errors jsonb / metadata jsonb` on `sync_runs`). The columns this draft would add to `job_listings` (`source_url`, `normalized_hash`, `closed_at`) are still missing and worth keeping. The `apply_url` column already exists. |
| `0002_role_fit_scores.sql.draft` | `role_fit_scores` already exists with **273 rows** of data. Live unique key is `(job_listing_id text, score_version text)`, not `(job_id, candidate_profile_id)` like this draft. Live also has `companyname`, `source`, `external_job_key`, `explanation_summary`, `score_version`. |
| `0003_contacts_enrichment.sql.draft` | The columns it adds (`role_type`, `seniority`, `is_mines_alumni`, `is_possible_pe`, `email_confidence`, `linkedin_url`, `provider_person_id`, `provider_source`, `verified_at`, `last_enriched_at`) are all missing from live `contacts` — but the calling code writes to `full_name` (live column is `contactname`) and `linkedin_url` (live is `linkedin`). Reconcile column names before applying. |
| `0004_outreach_workflow.sql.draft` | `outreach_actions` already exists with different columns (`action_type`, `priority`, `due_at`, `completed_at`, `metadata`). The other tables (`outreach_campaigns`, `email_drafts`, `letters`, `applications`) are genuinely new and worth keeping in the reconciliation. |
| `0005_email_messages.sql.draft` | Genuinely new — no live collision on `sent_messages`, `email_threads`, `email_messages`. Most likely candidate for least-edited promotion. |

## Reconciliation rules for the next session

1. **Read the live schema first.** Use the Supabase MCP
   (`list_tables verbose=true`, `execute_sql` against `pg_indexes` and
   `pg_constraint`) for any table you intend to touch. Diff against
   what's in this directory.

2. **Match production naming convention.** Promoted migrations live in
   `supabase/migrations/` (no `_drafts/`) and are named
   `YYYYMMDDHHMMSS_short_name.sql` to align with the existing 30
   migrations applied to `acwgirrldntjpzrhqmdh`.

3. **Additive only.** Use `add column if not exists` and
   `create table if not exists`. Do not drop or rename anything.
   Do not add unique/check constraints to columns with existing data
   without verifying the data complies.

4. **Apply via `apply_migration` MCP**, not by running `supabase db push`
   from a local checkout that doesn't have the full migration history.

5. **One migration per session.** Promote one draft at a time and
   commit before starting the next. Refer back to
   `docs/sandbox-current-state.md` only as the application-code
   reference, not as schema truth — the truth lives in
   `docs/supabase-schema-baseline.md`.

6. **Update calling code in the same commit.** Any TypeScript helper
   that reads/writes the reconciled table must compile against the
   final schema. The list of code paths that will fail today is in
   `docs/supabase-schema-baseline.md` §"Code that will fail against
   live schema".

## Why this exists

The previous session wrote five additive migrations on top of a
grep-based inventory of the application code. The grep correctly found
the columns the code reads and writes, but missed:

- Tables created out-of-band that don't appear in the migration log
  (`role_fit_scores`, `outreach_actions`, `job_sources`, `sync_runs`).
- Column-name drift between code and database (`full_name` vs
  `contactname`, `linkedin_url` vs `linkedin`, `job_id` vs
  `job_listing_id text`, `candidate_profile_id` vs `score_version`).
- Six SECURITY DEFINER views the code reads as if they were tables.
- A second job table (`job_positions`, 43 rows) parallel to
  `job_listings`.

Future sessions must query the database, not the code, to learn the
schema.
