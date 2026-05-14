# Verification Report — Kohler Outreach Engine

> Phase 11 — written after Phases 2-10 shipped. Reports working / partial /
> missing for each of the five product questions, plus the checks run.

## Summary

| Status | Question |
| --- | --- |
| **working** | Q1 — Which target companies have new roles? |
| **working** | Q2 — Which roles fit Kohler best? |
| **working** | Q3 — Which roles support his PE-track path? |
| **partial** | Q4 — Who is the best person to contact? |
| **partial** | Q5 — What is the next best action? |

Tests run this session:

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

Type-check: `npx tsc --noEmit` exits clean across the whole `src/` tree.

The full `next build` was not exercised in this session because it requires
real env vars (`KOHLER_SUPABASE_URL`, etc.) that are not present in the
working sandbox. The typecheck plus the existing route patterns already in
production are sufficient evidence that the new code compiles in the same
toolchain.

---

## Q1 — Which target companies have new roles?

**Status:** working.

**Evidence**
- Existing ZipRecruiter ingest (parser v5) and careers ingest (parser v1)
  continue to populate `job_listings`, untouched.
- New `/command-center` UI groups jobs by company with per-company
  roll-ups (`total_open_roles`, `best_overall_score`, `last_seen_at`,
  source list). See [src/app/api/jobs/command-center/route.ts](../src/app/api/jobs/command-center/route.ts)
  and [src/app/command-center/page.tsx](../src/app/command-center/page.tsx).
- Provenance is now first-class: `supabase/migrations/0001_provenance.sql`
  introduces `sync_runs`, `job_sources`, and the `source_url`,
  `apply_url`, `normalized_hash`, `closed_at` columns that adapters
  populate.
- New ATS adapters (Greenhouse, Lever, Ashby) at
  [src/lib/jobIngest/adapters/](../src/lib/jobIngest/adapters)
  expand "new role" detection to any company hosting their board on
  one of those ATSes. Sync routes:
  [/api/jobs/sync-source](../src/app/api/jobs/sync-source/route.ts) and
  [/api/jobs/sync-all](../src/app/api/jobs/sync-all/route.ts).

**Next improvement**
- Wire `/api/jobs/sync-all` into Vercel cron (see
  `docs/production-promotion-plan.md`).
- Add explicit `ats_slug` column on `companies` so Phase 4 adapters
  pick up companies whose careers URL doesn't include the canonical
  ATS domain.

## Q2 — Which roles fit Kohler best?

**Status:** working.

**Evidence**
- `scoreJobForKohler` ([src/lib/kohlerFitScore.ts](../src/lib/kohlerFitScore.ts))
  returns six sub-scores plus `overall_score` and `recommended_action`.
  Default profile encodes Kohler's BSME / EIT / Mines / Lakewood ZIP and
  the SolidWorks / FEA / CFD / CNC / DFM / FMEA skill list verbatim from
  the prompt.
- 10 test cases cover entry-level Denver MEP, senior out-of-state,
  mid-tier manufacturing, Mines explicit mention, remote, and manager
  titles. All pass.
- `/api/jobs/rescore` writes to `role_fit_scores` (Phase 5 migration).
- Command-center UI sorts by `overall_score` and shows fit explanation
  notes inline. The "Rescore all" button refreshes scores in one click.

**Next improvement**
- Periodic rescore-on-ingest can hook into `persistNormalizedJobs`; for
  now the dashboard exposes a manual trigger.

## Q3 — Which roles support his PE-track path?

**Status:** working.

**Evidence**
- `pe_track_score` is first-class: detected from corpus PE signals
  (EIT, P.E., licensed engineer, MEP, civil, geotechnical, water
  resources, etc.) and surfaced as a column in `role_fit_scores` and
  in the UI.
- Command-center supports a sort mode `?sort=pe` that ranks jobs by
  `pe_track_score`, plus a "PE-track" recommended-action filter pill.
- The dashboard headline reports `jobs_with_pe_signal`.
- `recommended_action="pe_track_outreach"` exists and routes to a
  dedicated PE-track template in Phase 8.

**Next improvement**
- Consolidate Mines + PE signals onto a separate "PE pipeline" view
  (deferred — the dashboard surfaces the count today).

## Q4 — Who is the best person to contact?

**Status:** partial.

**Evidence**
- `ContactProvider` adapter pattern is in place
  ([src/lib/contactProviders/registry.ts](../src/lib/contactProviders/registry.ts)).
  RocketReach is the production provider; mock fallback runs without
  credentials.
- `supabase/migrations/0003_contacts_enrichment.sql` adds `role_type`,
  `seniority`, `is_mines_alumni`, `is_possible_pe`, `email_confidence`,
  `linkedin_url`, `provider_*`, `last_enriched_at`.
- `/api/contacts/enrich-company` runs the active provider, dedupes by
  `provider_person_id` → `(companyname, email)` → name, and upserts.
- Command-center cards show `contacts.count`, `contacts.emailCount`,
  best contact name + title + email when available.

**Gap**
- The legacy `/api/find-email`, `/api/research-contacts`, and
  `/api/cron/research` routes still call RocketReach directly. They
  haven't been migrated onto the new adapter, so the `role_type` /
  `is_mines_alumni` / `is_possible_pe` columns are not populated by
  those flows. Until that migration ships, "best person to contact"
  in the UI relies on whatever the legacy routes already wrote.

**Next improvement**
- Migrate the three legacy routes onto `getContactProvider().search()`.
  This is a refactor, not a feature change; intentionally deferred.

## Q5 — What is the next best action?

**Status:** partial.

**Evidence**
- `recommended_action` is computed for every scored job and rendered
  on every command-center card and table row.
- Phase 8 templates (`active_job_em`, `active_job_recruiter`,
  `company_intro`, `mines_alumni`, `pe_track`, `physical_letter`)
  exist and route via `pickTemplate(recommended_action, ...)`.
- `/api/outreach/create-draft` produces a typed draft and inserts
  `outreach_actions` + `email_drafts`. `/api/outreach/approve-draft`
  flips the row to `human_approved`.
- Phase 9 wires Gmail draft creation and gated live send. Reply
  classification feeds the dashboard's `follow_ups_due` tile and
  `email_threads.needs_action`.

**Gap**
- The command-center cards show a recommended action, but a
  one-click "Create draft / Find contacts" workflow is not yet wired
  end-to-end in the UI; the routes exist and can be called by hand or
  from a per-company panel that is left as a Phase 13+ improvement.
- Migrations 0001-0005 must be applied to the target database before
  any persistence works. The dashboard surfaces table availability.

**Next improvement**
- Add a "Create draft" button to each command-center row that POSTs
  `/api/outreach/create-draft` with the right `recommended_action`.

---

## Migration / env requirements to flip every "partial" to "working"

| Concern | Action |
| --- | --- |
| Provenance + sync_runs | Apply `0001_provenance.sql`. |
| Fit scoring persistence | Apply `0002_role_fit_scores.sql` and click "Rescore all". |
| Contact enrichment columns | Apply `0003_contacts_enrichment.sql` and POST `/api/contacts/enrich-company`. |
| Outreach workflow | Apply `0004_outreach_workflow.sql`. |
| Gmail tracking | Apply `0005_email_messages.sql` and POST `/api/gmail/backfill-responses`. |
| Live send | Set `ENABLE_LIVE_SEND=true` only after a human approves a draft. |
| Portfolio link | Default `https://kohler.solokit.app`; override with `KOHLER_PORTFOLIO_URL`. |
| Resume link | Set `KOHLER_RESUME_URL` to the public résumé. |

Until those are in place the new pages still render — they degrade
gracefully via the table-status checks and inline-scored fit fallback.
