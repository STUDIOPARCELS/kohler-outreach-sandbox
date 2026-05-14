# Supabase True Sandbox Schema Inventory

Date: 2026-05-14

Source: live `information_schema.tables` and `information_schema.columns` query executed in the Supabase SQL editor.

Project: Kohler Outreach Sandbox (nwsjgppkfducaikxsyvk)

Current verified table count: 17

Pre-migration machine-readable inventory: `docs/supabase-true-sandbox-schema-inventory.json`.

Post-migration verification:

- `npx supabase migration list` shows local and remote migration `202605140001`.
- `npx supabase inspect db table-stats` shows the four additive tables.
- Row counts are tracked in `docs/supabase-true-sandbox-row-counts.json`.

| Table | Type | RLS | Columns |
| --- | --- | --- | --- |
| `candidate_assets` | BASE TABLE | disabled | 8 |
| `candidate_profile` | BASE TABLE | disabled | 12 |
| `companies` | BASE TABLE | disabled | 27 |
| `contacts` | BASE TABLE | disabled | 9 |
| `gmail_accounts` | BASE TABLE | disabled | 10 |
| `job_sources` | BASE TABLE | enabled | 13 |
| `job_ingest_runs` | BASE TABLE | disabled | 8 |
| `job_listings` | BASE TABLE | disabled | 27 |
| `jobs` | BASE TABLE | disabled | 12 |
| `outreach_actions` | BASE TABLE | enabled | 18 |
| `reachout_company_inserts` | BASE TABLE | disabled | 18 |
| `reachout_template` | BASE TABLE | disabled | 4 |
| `role_fit_scores` | BASE TABLE | enabled | 19 |
| `sync_runs` | BASE TABLE | enabled | 21 |
| `temp_company_addresses` | BASE TABLE | disabled | 8 |
| `tier_1_4_contacts` | BASE TABLE | disabled | 8 |
| `tracking` | BASE TABLE | disabled | 7 |
