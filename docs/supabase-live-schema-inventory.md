# Supabase Live Schema Inventory

Date: 2026-05-14

Source: live `information_schema.tables` and `information_schema.columns` query executed in the Supabase SQL editor for project `acwgirrldntjpzrhqmdh`.

Table count: 39

Full machine-readable inventory: `docs/supabase-live-schema-inventory.json`.

## Tables

| Table | Type | RLS | Columns |
| --- | --- | --- | --- |
| `candidate_assets` | BASE TABLE | disabled | 8 |
| `candidate_profile` | BASE TABLE | disabled | 12 |
| `companies` | BASE TABLE | enabled | 27 |
| `companies_backup_20260304` | BASE TABLE | disabled | 27 |
| `contacts` | BASE TABLE | enabled | 9 |
| `env_vault` | BASE TABLE | enabled | 7 |
| `gmail_accounts` | BASE TABLE | enabled | 10 |
| `job_ingest_runs` | BASE TABLE | enabled | 8 |
| `job_listings` | BASE TABLE | disabled | 27 |
| `job_positions` | BASE TABLE | enabled | 18 |
| `job_sources` | BASE TABLE | enabled | 13 |
| `jobs` | BASE TABLE | enabled | 12 |
| `kv_store_1ab1f459` | BASE TABLE | enabled | 2 |
| `kv_store_2674f927` | BASE TABLE | enabled | 2 |
| `kv_store_2d4d87db` | BASE TABLE | enabled | 2 |
| `kv_store_6ce54832` | BASE TABLE | enabled | 2 |
| `kv_store_a035844b` | BASE TABLE | enabled | 2 |
| `kv_store_a1d84d39` | BASE TABLE | enabled | 2 |
| `mc_activities` | BASE TABLE | disabled | 6 |
| `mc_media` | BASE TABLE | disabled | 9 |
| `mc_projects` | BASE TABLE | disabled | 7 |
| `mc_research` | BASE TABLE | disabled | 8 |
| `mc_tasks` | BASE TABLE | disabled | 11 |
| `outreach_actions` | BASE TABLE | enabled | 16 |
| `pile_a_relevant_jobs` | VIEW | disabled | 8 |
| `pile_a_with_jobs` | VIEW | disabled | 5 |
| `pile_b_no_jobs` | VIEW | disabled | 4 |
| `policy_doc_chunks` | BASE TABLE | disabled | 7 |
| `policy_documents` | BASE TABLE | disabled | 8 |
| `reachout_company_inserts` | BASE TABLE | disabled | 18 |
| `reachout_final_letters` | VIEW | disabled | 10 |
| `reachout_template` | BASE TABLE | disabled | 4 |
| `relevant_roles` | VIEW | disabled | 10 |
| `reno_deals` | BASE TABLE | disabled | 7 |
| `role_fit_scores` | BASE TABLE | enabled | 19 |
| `sync_runs` | BASE TABLE | enabled | 21 |
| `temp_company_addresses` | BASE TABLE | enabled | 8 |
| `tier_1_4_contacts` | VIEW | disabled | 8 |
| `tracking` | BASE TABLE | enabled | 7 |

## Operating Rule

Before creating or changing migrations, compare proposed tables and columns against this inventory. If this file is stale, regenerate it from the live Supabase project first.
