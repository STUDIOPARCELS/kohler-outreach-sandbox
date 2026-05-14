# Sandbox Database Targets

Date: 2026-05-14

## Current Discovery

Supabase CLI is now authenticated and the repo can link to Supabase projects.

Discovered relevant projects:

| Project | Ref | Role |
| --- | --- | --- |
| `KOHLER OS` | `acwgirrldntjpzrhqmdh` | Production-style database currently used by local env/Vercel env before correction |
| `Kohler Outreach Sandbox` | `nwsjgppkfducaikxsyvk` | Actual sandbox database for this app |

## True Sandbox Row Counts

Live row counts from `nwsjgppkfducaikxsyvk`:

| Table | Rows |
| --- | ---: |
| `companies` | 398 |
| `contacts` | 788 |
| `job_listings` | 248 |
| `role_fit_scores` | 185 |
| `jobs` | 75 |
| `reachout_company_inserts` | 173 |
| `tracking` | 1330 |
| `gmail_accounts` | 1 |
| `job_ingest_runs` | 64 |
| `candidate_profile` | 1 |
| `candidate_assets` | 2 |
| `reachout_template` | 1 |
| `job_sources` | 0 |
| `sync_runs` | 0 |
| `outreach_actions` | 0 |

Machine-readable counts: `docs/supabase-true-sandbox-row-counts.json`.

## Operating Decision

Treat `acwgirrldntjpzrhqmdh` as production data.

For future sandbox work, target `nwsjgppkfducaikxsyvk` unless explicitly promoting to production.

Runtime env vars have been switched:

- Local ignored env files now point at `https://nwsjgppkfducaikxsyvk.supabase.co`.
- Vercel project `kohler-outreach-sandbox` has updated Supabase URL/service-role variables for Production and Preview; Vercel reports a new deployment is needed for changes to take effect.
- Backup folder before schema/runtime changes: `D:\KOHLER database\_backups\kohler-outreach-sandbox\2026-05-14T18-48-14-004Z`.
- Additive migration `202605140001_job_intelligence_spine.sql` is applied to the true sandbox.
- True sandbox `role_fit_scores` contains 185 rows after backfill.
