# Supabase Schema Baseline — KOHLER OS (`acwgirrldntjpzrhqmdh`)

> **Source of truth.** Generated from `information_schema`, `pg_indexes`,
> `pg_constraint`, and Supabase advisors via the Supabase MCP on
> 2026-05-14. Replaces the grep-based inventory in
> `docs/sandbox-current-state.md` for any decision involving the database.
>
> **The kohler-outreach app reads/writes this database.** The
> `KOHLER_SUPABASE_URL` env var stored in `public.env_vault` resolves to
> this project, per the row notes ("Kohler Supabase instance",
> "Same as service role key"). There is also a separate Supabase project
> `nwsjgppkfducaikxsyvk` named "Kohler Outreach Sandbox" — out of scope
> for this baseline; investigate before pointing the sandbox app at it.

## Project facts

| Field | Value |
| --- | --- |
| Project ID / ref | `acwgirrldntjpzrhqmdh` |
| Name | KOHLER OS |
| Organization | STUDIO PARCELS (`chxlrdfgtozdiyvwamne`) |
| Region | `us-west-2` |
| Postgres | 17.6.1.063 (engine 17, channel `ga`) |
| Status | `ACTIVE_HEALTHY` |
| Created | 2026-01-04T21:40:02Z |
| DB host | `db.acwgirrldntjpzrhqmdh.supabase.co` |

## Migration history

30 migrations applied, naming convention `YYYYMMDDHHMMSS_name`. The most
recent migrations relevant to the outreach pipeline:

| Version | Name |
| --- | --- |
| 20260303173536 | `add_niche_column_to_companies` |
| 20260306160735 | `add_email_searched_to_contacts` |
| 20260306162119 | `add_emailed_at_to_letters` |
| 20260306175807 | `create_jobs_cache_table` |
| 20260308051638 | `add_job_tracking_to_letters` |
| 20260325153913 | `create_env_vault` |
| 20260401181242 | `add_followup2_at_column` |
| 20260401183314 | `add_jobs_import_columns` |
| 20260401184714 | `create_gmail_accounts` |
| 20260401184723 | `create_job_positions` |
| 20260401184732 | `create_job_ingest_runs` |
| 20260401192619 | `create_match_company_reverse_function` |
| 20260401210443 | `extend_job_listings_for_ingest` |
| 20260401210525 | `create_relevant_roles_view` |
| 20260401211139 | `make_apply_url_nullable` |
| 20260401211836 | `setup_daily_ziprecruiter_cron` |
| 20260401211926 | `enable_pg_cron_and_pg_net` |
| 20260402164902 | `add_job_listings_tracking_columns` |
| 20260403004250 | `add_relevance_gate_columns` |

**Important gap.** The following tables exist with data but no creation
migration is in `supabase_migrations.schema_migrations`:

- `job_sources` (created out-of-band; 0 rows)
- `sync_runs` (created out-of-band; 0 rows)
- `role_fit_scores` (created out-of-band; **273 rows**)
- `outreach_actions` (created out-of-band; 0 rows)

These were applied through the Supabase SQL editor or a direct
`apply_migration` call that bypassed the standard migration flow. Treat
the live `information_schema` as authoritative, not the migration log.

## Tables in scope for kohler-outreach

The `public` schema also contains tables for unrelated products
(`mc_*` mission control, `policy_*` vector RAG, `reno_deals`,
`kv_store_*`). Those are listed in §"Other tables in `public`" at the
end and are not touched by the outreach pipeline.

### `companies` — 431 rows

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `int4` | PK, sequence-default |
| `companyname` | `text` | |
| `tier` | `int4` | nullable |
| `city` | `text` | |
| `commutezone` | `text` | |
| `workmodel` | `text` | |
| `drugtest` | `text` | |
| `activerole` | `bool` | default `false` |
| `notes` | `text` | |
| `datatype` | `text` | |
| `emails` | `text` | |
| `culture_score` | `int4` | default `0` |
| `culture_tag` | `text` | |
| `outdoor` | `bool` | default `false` |
| `music` | `bool` | default `false` |
| `prototyping` | `bool` | default `false` |
| `craftsmanship` | `bool` | default `false` |
| `company_key` | `text` | |
| `culture_hook` | `text` | |
| `company_about` | `text` | |
| `careers_url` | `text` | |
| `mailing_address1` | `text` | |
| `mailing_address2` | `text` | |
| `mailing_city` | `text` | |
| `mailing_state` | `text` | |
| `mailing_zip` | `text` | |
| `niche` | `text` | |

Indexes: `companies_pkey (id)`. RLS: enabled, no policies (advisor INFO).

### `contacts` — 843 rows

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `int4` | PK |
| `companyname` | `text` | |
| `contactname` | `text` | **not** `full_name` |
| `title` | `text` | |
| `email` | `text` | |
| `linkedin` | `text` | |
| `phone` | `text` | |
| `notes` | `text` | |
| `email_searched` | `bool` | default `false` |

Indexes: `contacts_pkey (id)`. **No** `role_type`, `seniority`,
`is_mines_alumni`, `is_possible_pe`, `email_confidence`,
`provider_person_id`, `linkedin_url` (use `linkedin`),
`last_enriched_at`. The Phase 7 enrichment migration added all of
these — none of them exist on the live table.

### `tracking` — 1330 rows

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `int4` | PK |
| `companyname` | `text` | UNIQUE |
| `status` | `text` | |
| `lastchecked` | `timestamptz` | |
| `applieddate` | `date` | |
| `followupdate` | `date` | |
| `notes` | `text` | |

Constraints: `tracking_companyname_key UNIQUE (companyname)`. RLS
policies: `Public insert tracking` (WITH CHECK true), `Public update
tracking` (USING true) — both flagged by advisor as overly permissive.

### `job_listings` — 383 rows

This is the main job table. Phase 4 adapter persistence writes here.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `int4` | PK |
| `companyname` | `text` | |
| `title` | `text` | |
| `salary` | `text` | |
| `location` | `text` | |
| `employment_type` | `text` | |
| `employer_type` | `text` | |
| `workplace_type` | `text` | |
| `summary` | `text` | |
| `apply_url` | `text` | already exists |
| `posted_date` | `timestamptz` | |
| `fetched_at` | `timestamptz` | default `now()` |
| `source` | `text` | default `'dice'` |
| `company_id` | `int4` | FK → `companies.id` |
| `external_job_key` | `text` | |
| `gmail_message_id` | `text` | |
| `job_url` | `text` | |
| `received_at` | `timestamptz` | default `now()` |
| `raw_payload` | `jsonb` | default `'{}'::jsonb` |
| `ingest_status` | `text` | default `'new'` |
| `parser_version` | `int4` | default `1` |
| `first_seen_at` | `timestamptz` | default `now()` |
| `last_seen_at` | `timestamptz` | default `now()` |
| `times_seen` | `int4` | default `1` |
| `is_relevant` | `bool` | default `true` |
| `match_score` | `int4` | default `0` |
| `relevance_reason` | `text` | |

**Missing vs. my draft 0001 migration:** `source_url`, `normalized_hash`,
`closed_at`. The other three columns I tried to add (`apply_url`,
`first_seen_at`, `last_seen_at`) already exist — `IF NOT EXISTS` would
have made them no-ops, fine.

Indexes:
- `job_listings_pkey (id)`
- `idx_job_listings_company (companyname)`
- `job_listings_company_id_idx (company_id)`
- `job_listings_ingest_status_idx (ingest_status)`
- `job_listings_received_at_idx (received_at DESC)`
- `job_listings_source_external_job_key_uidx UNIQUE (source, external_job_key)`

RLS: disabled (advisor ERROR — `rls_disabled_in_public`).

### `job_positions` — 43 rows

A **parallel** job table I did not know existed in Phase 1.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `source` | `text` | default `'ziprecruiter_email'` |
| `external_job_key` | `text` | |
| `gmail_message_id` | `text` | |
| `company_id` | `int4` | FK → `companies.id` |
| `company_name` | `text` | (note: `company_name`, not `companyname`) |
| `title` | `text` | |
| `location_text` | `text` | |
| `job_url` | `text` | |
| `salary_text` | `text` | |
| `zip_code` | `text` | default `'80226'` |
| `radius_miles` | `int4` | default `30` |
| `received_at` | `timestamptz` | |
| `source_payload` | `jsonb` | default `'{}'::jsonb` |
| `parser_version` | `int4` | default `1` |
| `outreach_state` | `text` | default `'new'` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Constraints: `job_positions_source_external_job_key_key UNIQUE (source,
external_job_key)`. **Action item for next session:** decide whether
to merge `job_positions` into `job_listings`, deprecate it, or keep
both. The grep-based inventory missed this table entirely.

### `job_ingest_runs` — 79 rows

ZipRecruiter ingest run tracker (existing).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `started_at` | `timestamptz` | default `now()` |
| `finished_at` | `timestamptz` | |
| `messages_seen` | `int4` | default `0` |
| `jobs_extracted` | `int4` | default `0` |
| `companies_created` | `int4` | default `0` |
| `status` | `text` | default `'running'` |
| `error_text` | `text` | |

Coexists with `sync_runs` (different shape). Phase 4 sync routes
should target `sync_runs`; the existing ZipRecruiter route keeps
writing here.

### `job_sources` — 0 rows (exists, no creation migration)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `company_id` | `text` | nullable |
| `companyname` | `text` | |
| `source_type` | `text` | |
| `provider` | `text` | nullable |
| `source_url` | `text` | |
| `external_source_id` | `text` | |
| `enabled` | `bool` | default `true` |
| `config` | `jsonb` | default `'{}'::jsonb` |
| `last_sync_run_id` | `uuid` | |
| `last_synced_at` | `timestamptz` | |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Indexes:
- `job_sources_pkey (id)`
- `job_sources_companyname_idx (companyname)`
- `job_sources_enabled_idx (enabled, source_type)`
- `job_sources_identity_idx UNIQUE (companyname, source_type,
  COALESCE(provider, ''), COALESCE(source_url, ''),
  COALESCE(external_source_id, ''))`

**Diff vs. my draft 0001:** my draft created `job_sources` as a
catalog with `display_name`, `category`, `base_url`. The live
schema is per-company (`companyname`, `company_id`), with `provider`
and `last_sync_run_id`. The intent is different — live is "every
configured source per company"; mine was "registry of source types".
The new code in Phase 4 must target the live schema or be reframed.

### `sync_runs` — 0 rows (exists, no creation migration)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `job_source_id` | `uuid` | FK → `job_sources.id` (ON DELETE SET NULL) |
| `provider` | `text` | |
| `source_type` | `text` | |
| `companyname` | `text` | |
| `status` | `text` | check: `running, completed, completed_with_errors, error, skipped` |
| `trigger_type` | `text` | |
| `dry_run` | `bool` | default `false` |
| `started_at` | `timestamptz` | default `now()` |
| `finished_at` | `timestamptz` | |
| `duration_ms` | `int4` | |
| `companies_checked` | `int4` | default `0` |
| `jobs_found` | `int4` | default `0` |
| `jobs_relevant` | `int4` | default `0` |
| `jobs_inserted` | `int4` | default `0` |
| `jobs_updated` | `int4` | default `0` |
| `jobs_skipped` | `int4` | default `0` |
| `errors` | `jsonb` | default `'[]'::jsonb` |
| `metadata` | `jsonb` | default `'{}'::jsonb` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Indexes: `sync_runs_pkey (id)`, `sync_runs_provider_started_idx`,
`sync_runs_status_idx`.

**Diff vs. my draft 0001:** my draft used `inserted/updated/closed/
skipped/errors` (integer) plus `warnings` (jsonb). Live uses
`jobs_inserted/jobs_updated/jobs_skipped` (int) plus `errors` (jsonb).
My `closed` and `warnings` columns don't exist. My status enum
included `partial`, but the live check enum uses `completed_with_errors`.

`src/lib/syncRuns.ts` (Phase 3) writes `inserted`, `updated`, `closed`,
`skipped`, `errors` (as integer), `warnings` (as jsonb), `params`
(as jsonb), `result` (as jsonb), `error_text`, `triggered_by` —
**none of these match the live column names.** Helper must be
rewritten to write `jobs_inserted`, `jobs_updated`, `jobs_skipped`,
`errors` (jsonb), `metadata` (jsonb), `trigger_type`, etc.

### `role_fit_scores` — 273 rows (exists, no creation migration)

This is the highest-collision table. Phase 5 of the prior session
created a duplicate. The live schema is mostly compatible but the
key column is `job_listing_id text` (not `int8`), there's a
`score_version text` column, and `explanation_summary text` is
separate from `explanation_json jsonb`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `job_listing_id` | `text` | (not int) |
| `companyname` | `text` | |
| `source` | `text` | |
| `external_job_key` | `text` | |
| `score_version` | `text` | default `'kohler-fit-v1'` |
| `skill_fit_score` | `int4` | default `0` |
| `entry_level_score` | `int4` | default `0` |
| `pe_track_score` | `int4` | default `0` |
| `niche_score` | `int4` | default `0` |
| `location_score` | `int4` | default `0` |
| `mines_signal_score` | `int4` | default `0` |
| `overall_score` | `int4` | default `0` |
| `recommended_action` | `text` | check enum matches my Phase 5 design |
| `explanation_summary` | `text` | |
| `explanation_json` | `jsonb` | default `'{}'::jsonb` |
| `scored_at` | `timestamptz` | default `now()` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Constraints:
- `role_fit_scores_recommended_action_check`:
  `apply_now, email_engineering_manager, email_recruiter,
  alumni_outreach, pe_track_outreach, physical_letter, monitor, skip`
- `role_fit_scores_job_version_idx UNIQUE (job_listing_id,
  score_version)` — note the unique key is `(job_listing_id,
  score_version)`, NOT `(job_listing_id, candidate_profile_id)` like
  my draft used.

Indexes:
- `role_fit_scores_action_idx (recommended_action, overall_score
  DESC)`
- `role_fit_scores_company_score_idx (companyname, overall_score
  DESC)`

**Diff vs. my draft 0002:**
- live has no `candidate_profile_id` column; conflict is on
  `(job_listing_id, score_version)`.
- live `job_listing_id` is `text`, mine was `int8`.
- live has `score_version`, `companyname`, `source`,
  `external_job_key`, `explanation_summary` — mine had none of these.

`/api/jobs/rescore` (Phase 5 route) upserts on
`onConflict: "job_id,candidate_profile_id"` — that conflict spec
**does not exist** in the live table. Every call would error.

### `outreach_actions` — 0 rows (exists, no creation migration)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `companyname` | `text` | |
| `job_listing_id` | `text` | |
| `contact_id` | `text` | |
| `campaign_id` | `text` | |
| `action_type` | `text` | check enum (12 values) |
| `status` | `text` | default `'pending'`, check enum (5 values) |
| `priority` | `int4` | default `0` |
| `due_at` | `timestamptz` | |
| `completed_at` | `timestamptz` | |
| `source` | `text` | |
| `title` | `text` | |
| `notes` | `text` | |
| `metadata` | `jsonb` | default `'{}'::jsonb` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Constraints:
- `outreach_actions_action_type_check`:
  `apply_now, email_engineering_manager, email_recruiter,
  alumni_outreach, pe_track_outreach, physical_letter, find_contacts,
  create_draft, mark_applied, follow_up, monitor, skip`
- `outreach_actions_status_check`:
  `pending, in_progress, completed, skipped, canceled`

Indexes:
- `outreach_actions_pkey (id)`
- `outreach_actions_company_idx (companyname, created_at DESC)`
- `outreach_actions_job_idx (job_listing_id)`
- `outreach_actions_status_due_idx (status, due_at)`

**Diff vs. my draft 0004:** my draft used `template_key`, `channel`,
`recommended_action`, `status` enum (`queued, drafted, human_approved,
sent, replied, bounced, abandoned`), and FK to `email_drafts`. The
live table uses `action_type` (which IS the recommended_action), no
`template_key`, no `channel` column, status enum is different. My
`channel="letter"` path doesn't have a column to write to.

The route `/api/outreach/create-draft` writes to columns that don't
exist (`template_key`, `recommended_action`, `channel`,
`contact_id` as bigint not text). Every call would fail.

### `reachout_company_inserts` — 210 rows

Existing letter draft flow. Has its own `status` enum and lifecycle.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |
| `companyname` | `text` | |
| `contactname` | `text` | |
| `contact_title` | `text` | |
| `contact_email` | `text` | |
| `custom_paragraph` | `text` | |
| `status` | `text` | check: `draft, ready_to_print, printed, sent, emailed` |
| `body_final` | `text` | |
| `printed_at` | `timestamptz` | |
| `sent_at` | `timestamptz` | |
| `subject_final` | `text` | |
| `emailed_at` | `timestamptz` | |
| `job_title` | `text` | |
| `job_url` | `text` | |
| `job_skills_matched` | `jsonb` | |
| `followup2_at` | `timestamptz` | |

Phase 8 must decide whether new outreach drafts go here or into a new
`email_drafts` table. The live `outreach_actions` is a workflow log
parallel to letter rows, not the draft body itself.

### `reachout_template` — 1 row

`{ id, subject_template, body_template, updated_at }`. Used by the
`reachout_final_letters` view. Phase 8 templates should not bypass this
unless the workflow consciously deprecates the existing letter flow.

### `gmail_accounts` — 1 row

Already covered by `src/lib/googleAuth.ts`. Live shape matches what
the existing code expects: `id (uuid), email (unique), refresh_token,
access_token, token_expires_at, label_name, label_id,
last_history_id, created_at, updated_at`.

### `candidate_profile` — 1 row

Richer than the Phase 5 default assumed.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `int4` | PK, default `1` |
| `full_name` | `text` | |
| `email` | `text` | |
| `phone` | `text` | |
| `location` | `text` | |
| `portfolio_url` | `text` | |
| `headline` | `text` | |
| `summary` | `text` | |
| `proof_points` | `text` | |
| `skills` | `text` | (text, not array) |
| `cultural_hooks` | `text` | |
| `updated_at` | `timestamptz` | default `now()` |

Phase 5/8 default-candidate code should READ this row instead of
hardcoding "Kohler Wood". Note `skills` is a single text field, not
an array — split-on-comma at read time.

### `candidate_assets` — 2 rows

`profile_id` FK → `candidate_profile.id` ON DELETE CASCADE.
`asset_type` check enum: `image, video, link, resume, card,
signature`. Has `title, url, caption, sort_order, created_at`.

The Phase 9 / Phase 8 "résumé URL" can be sourced from a row here
where `asset_type = 'resume'` instead of an env var.

### `temp_company_addresses` — 79 rows

Used by `/api/merge-data` — staged addresses for backfill into
`companies`. No PK. Out of scope for the new pipeline.

### `companies_backup_20260304` — 319 rows

Backup snapshot. No PK. Ignore.

### `env_vault` — 12 rows

Stores the `kohler-outreach` project's env vars
(`KOHLER_SUPABASE_URL`, `KOHLER_SUPABASE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `ROCKETREACH_API_KEY`, `GMAIL_USER`,
`GMAIL_APP_PASSWORD`, `REPLY_TO_EMAIL`, `GOOGLE_PLACES_API_KEY`,
`API_SECRET`). UNIQUE `(project, key)`. RLS enabled, no policies.

## Views

| View | Definition |
| --- | --- |
| `relevant_roles` | `select … from job_listings where ingest_status in ('new','open') or ingest_status is null` |
| `tier_1_4_contacts` | join `companies` × `contacts` where tier 1-4 |
| `reachout_final_letters` | join `reachout_company_inserts` × `reachout_template` (template id=1), substitutes `{{COMPANY}}`, `{{CUSTOM_PARAGRAPH}}`, `{{TODAY_DATE}}` |
| `pile_a_with_jobs` | companies tier 1-4 with at least one row in `jobs` |
| `pile_a_relevant_jobs` | companies × jobs with engineering-keyword title filter |
| `pile_b_no_jobs` | tier 1-4 companies with zero rows in `jobs` |

The grep-based inventory missed all six. **All are SECURITY DEFINER**,
flagged ERROR by the advisor — out of scope here, but recorded for the
security backlog.

## Other tables in `public` (out of scope)

| Table | Rows | Belongs to |
| --- | --- | --- |
| `kv_store_*` (×6) | 0–2 | misc Supabase KV storage |
| `mc_projects`, `mc_tasks`, `mc_activities`, `mc_research`, `mc_media` | 6, 10, 21, 37, 19 | mission-control product |
| `policy_documents`, `policy_doc_chunks` | 570, 720 | vector RAG product |
| `reno_deals` | 0 | rental scraper |
| `jobs` | 75 | legacy import target (pre-`job_listings`) |

## Security advisors (snapshot, out of scope for reconciliation)

Recorded so the security backlog has a starting point. **Do not auto-fix.**

| Level | Name | Tables / objects |
| --- | --- | --- |
| ERROR | `rls_disabled_in_public` | `mc_projects, mc_tasks, mc_activities, mc_research, mc_media, candidate_profile, reachout_company_inserts, reachout_template, candidate_assets, companies_backup_20260304, job_listings, policy_documents, policy_doc_chunks, reno_deals` |
| ERROR | `security_definer_view` | `relevant_roles, tier_1_4_contacts, reachout_final_letters, pile_a_with_jobs, pile_a_relevant_jobs, pile_b_no_jobs` |
| WARN | `rls_policy_always_true` | `jobs.Public insert jobs`, `tracking.Public insert tracking`, `tracking.Public update tracking` |
| WARN | `function_search_path_mutable` | `auto_create_draft_letter, auto_delete_draft_letter, search_policy_docs, search_policy_docs_text, match_company_reverse, set_updated_at_timestamp, auto_create_reachout_letter` |
| WARN | `extension_in_public` | `vector` extension |
| WARN | `auth_leaked_password_protection` | Auth global |
| INFO | `rls_enabled_no_policy` | many (env_vault, gmail_accounts, job_ingest_runs, job_positions, job_sources, kv_store_*, outreach_actions, role_fit_scores, sync_runs, temp_company_addresses) |

## Collision summary — what the prior session got wrong

| Phase | Draft migration | Collision with live |
| --- | --- | --- |
| 3 | `0001_provenance.sql` adds `job_sources, sync_runs, source_url/apply_url/normalized_hash/closed_at on job_listings` | `job_sources, sync_runs` already exist with different schemas; `apply_url` already exists. |
| 5 | `0002_role_fit_scores.sql` | `role_fit_scores` already exists with 273 rows; columns and unique key differ. |
| 7 | `0003_contacts_enrichment.sql` adds `role_type, seniority, is_mines_alumni, …` to `contacts` | additive — would apply, but app code writes `full_name` to a column that doesn't exist (it's `contactname`). |
| 8 | `0004_outreach_workflow.sql` creates `outreach_campaigns, outreach_actions, email_drafts, letters, applications` | `outreach_actions` already exists with different shape; `email_drafts/letters/applications/outreach_campaigns` are genuinely new. |
| 9 | `0005_email_messages.sql` creates `sent_messages, email_threads, email_messages` | genuinely new — no live collision. |

## Code that will fail against live schema (next session must fix)

- `src/lib/syncRuns.ts` — column names don't match `sync_runs`.
- `src/app/api/jobs/sync-source/route.ts`,
  `src/app/api/jobs/sync-all/route.ts` — call `startSyncRun` with
  fields `triggered_by`, `params` that don't exist; would still
  silently drop into the warn-once fallback.
- `src/lib/jobIngest/persist.ts` — writes `parser_version` (int)
  fine; writes `source_url` and `normalized_hash` which don't exist
  on `job_listings`.
- `src/app/api/jobs/rescore/route.ts` — upserts on
  `(job_id, candidate_profile_id)` conflict; live unique is
  `(job_listing_id, score_version)`. `job_id` is also the wrong
  column name (live is `job_listing_id text`).
- `src/app/api/contacts/enrich-company/route.ts` — writes `full_name`
  to a column that doesn't exist on `contacts` (it's `contactname`).
  Writes `linkedin_url` (live column is `linkedin`).
- `src/app/api/outreach/create-draft/route.ts` — writes to
  `outreach_actions.template_key, channel, recommended_action,
  contact_id (bigint)` — none of those exist (live has `action_type`,
  `contact_id text`, no `template_key/channel`). Inserts into
  `email_drafts`/`letters` which don't exist yet (Phase 8 migration
  not applied).
- `src/app/api/outreach/approve-draft/route.ts` — same.
- `src/app/api/gmail/create-draft/route.ts` — same draft / sent_messages
  table missing.
- `src/app/api/metrics/overview/route.ts` — counts `email_drafts,
  sent_messages, email_threads, applications, outreach_actions`. The
  last one exists; the other four don't yet. Designed to degrade to
  zero when missing, so this one is OK.

The next session's reconciliation must rewrite the migrations and the
calling code to match the **live** schema, not my drafts.
