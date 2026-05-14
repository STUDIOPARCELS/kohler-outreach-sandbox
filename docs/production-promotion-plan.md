# Production Promotion Plan

> ⚠️ **DO NOT promote anything from `supabase/migrations/_drafts/`
> as written.** The 2026-05-14 schema audit found that four of the
> five tables already exist in production with different shapes
> (`role_fit_scores` has 273 rows). See
> [`docs/supabase-schema-baseline.md`](supabase-schema-baseline.md)
> for the live truth. The promotion order below is the *intent* —
> the *actual* migrations must be re-derived against the baseline,
> as instructed in `docs/SESSION_HANDOFF_NEXT.md`.

> Phase 12 — release path for the Phase 2-10 work in this sandbox.
> Every change is additive and ENABLE_LIVE_SEND is the only behavior
> that requires deliberate human action to enable.

## What changed in the sandbox

Eleven commits shipped in this run, all on the `kohler-outreach-claude-sandbox`
GitHub clone. Each phase was committed separately so a release manager can
cherry-pick.

| Commit | Phase | Scope |
| --- | --- | --- |
| 1 | 1+2 | Inventory docs + sandbox env badge + runtime diagnostics. |
| 2 | 3 | Provenance migration, sync_runs helpers, normalization tests. |
| 3 | 4 | Job-source adapters (Greenhouse / Lever / Ashby), sync routes. |
| 4 | 5 | Kohler fit scoring, role_fit_scores migration, rescore route. |
| 5 | 6 | Command-center page + API. Mounted Nav globally. |
| 6 | 7 | Contact provider adapter, contacts enrichment migration. |
| 7 | 8 | Outreach workflow tables + 6 templates + create/approve routes. |
| 8 | 9 | Gmail draft / send / reply backfill + classification. |
| 9 | 10 | Metrics overview API + dashboard page. |

## Promotion gates

A change is promotion-ready when:

1. It ships behind a feature flag or additive migration.
2. It has tests or verifiable smoke evidence in the sandbox.
3. It does not break any existing production route or data shape.
4. The promotion plan lists the exact env vars and migrations needed in prod.

## Migrations to apply (in order)

| Filename | Purpose | Reversible? |
| --- | --- | --- |
| `supabase/migrations/0001_provenance.sql` | `job_sources`, `sync_runs`, additive columns on `job_listings`. | yes — drop tables, drop columns |
| `supabase/migrations/0002_role_fit_scores.sql` | `role_fit_scores`. Defensively seeds `candidate_profile.id=1`. | yes |
| `supabase/migrations/0003_contacts_enrichment.sql` | Additive enrichment columns on `contacts`. | yes |
| `supabase/migrations/0004_outreach_workflow.sql` | `outreach_campaigns`, `outreach_actions`, `email_drafts`, `letters`, `applications`. | yes |
| `supabase/migrations/0005_email_messages.sql` | `sent_messages`, `email_threads`, `email_messages`. | yes |

All migrations use `IF NOT EXISTS` and `ON CONFLICT DO NOTHING`, so re-runs
are no-ops. None drop columns or rename existing fields.

## Env vars required in production

| Env var | Required? | Default | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_ENV` | optional | inferred | Forces the env-badge label. Set to `production` on prod, `sandbox` on the sandbox. |
| `ENABLE_LIVE_SEND` | optional | `false` | Must be `true` for `/api/gmail/send-approved` to send. Setting `true` does NOT auto-send drafts; each draft still requires `status=human_approved`. |
| `KOHLER_PORTFOLIO_URL` | optional | `https://kohler.solokit.app` | Phase 8 templates. |
| `KOHLER_RESUME_URL` | optional | unset | Public résumé link (must be a URL the recipient can fetch). |
| `REPLY_TO_EMAIL` | already present | `akwood1@mines.edu` | Used as Gmail reply-to and treated as the candidate's address by Phase 9 backfill matching. |

## Production routes affected

**New routes** (additive):

- `GET  /api/runtime-diagnostics`
- `POST /api/jobs/sync-source`
- `POST /api/jobs/sync-all`
- `POST /api/jobs/rescore`
- `GET  /api/jobs/command-center`
- `POST /api/contacts/enrich-company`
- `POST /api/outreach/create-draft`
- `POST /api/outreach/approve-draft`
- `GET  /api/outreach/actions`
- `POST /api/applications/mark-applied`
- `POST /api/gmail/create-draft`
- `POST /api/gmail/send-approved`
- `POST /api/gmail/backfill-responses`
- `POST /api/gmail/sync-incremental`
- `GET  /api/metrics/overview`

**Pages added:**

- `/command-center`
- `/dashboard`

**Modified routes/pages:**

- `src/app/layout.tsx` — mounts `<Nav />` and `<EnvironmentBadge />`. Existing pages now render a top nav bar that they did not have before. This is a visible UX change.
- `src/components/Nav.tsx` — added Dashboard, Command center links. Existing links preserved.

**No existing API route or table is altered by this work.** The legacy
ZipRecruiter and careers ingest routes still write to `job_listings` /
`job_ingest_runs`. Phase 4 sync routes write to the same `job_listings` table
but additionally populate `sync_runs`.

## Rollback path

- **Each migration is additive**, so rollback is "stop reading the new
  columns / tables." No destructive migration.
- **For Gmail send specifically**, rollback is `ENABLE_LIVE_SEND=false`.
- **For the new routes**, removing them or adding a Vercel rewrite to
  return 404 reverts the surface area.
- **For the Nav mount**, reverting `src/app/layout.tsx` removes the global
  nav and the env badge.

## Smoke test checklist (production cutover)

Run in order against the production deployment, using the `X-API-SECRET`
or browser session as appropriate:

- [ ] `GET /api/health` returns `200`.
- [ ] `GET /api/runtime-diagnostics` reports `environment=production`
      and `parserVersions.ziprecruiter_email=5`, `parserVersions.careers=1`.
- [ ] `GET /open-roles` renders with current ingest data (legacy page,
      no behavior change expected).
- [ ] `GET /command-center` renders the four KPI tiles and at least one
      company card with a recommended-action pill.
- [ ] `GET /dashboard` shows the migration-status checklist with all
      five rows green.
- [ ] `POST /api/jobs/sync-all` (with `dry_run:true`) returns counts
      without writing.
- [ ] `POST /api/contacts/enrich-company` (with `prefer_provider:"mock"`)
      inserts mock contacts for one safe sentinel company.
- [ ] `POST /api/outreach/create-draft` for the sentinel company produces
      a draft row in `email_drafts`.
- [ ] `POST /api/gmail/create-draft` (with `mode:"draft"`) creates a Gmail
      draft for the sentinel and writes a `sent_messages` row.
- [ ] `POST /api/gmail/backfill-responses` with `dry_run:true` returns
      classification counts.
- [ ] Confirm `ENABLE_LIVE_SEND` is `false` in production until a human
      approves a real send.

## Data validation queries

```sql
-- Job pipeline still healthy
select count(*) from job_listings;
select count(*) from job_listings where is_relevant = true;
select count(*) from job_ingest_runs where status = 'completed' and started_at > now() - interval '7 days';

-- New tables populated
select count(*) from job_sources;
select count(*) from sync_runs;
select count(*) from role_fit_scores;
select count(*) from outreach_actions;
select count(*) from email_drafts;
select count(*) from sent_messages;
select count(*) from email_threads;
select count(*) from email_messages;
select count(*) from applications;

-- Promotion sanity check
select count(*) from job_listings
  where source_url is not null or apply_url is not null;
```

## Production-only features to preserve

- `pg_cron` schedule against `/api/ingest/ziprecruiter` (do NOT migrate to
  Vercel cron in production — sandbox uses Vercel cron only).
- Production `kohler-outreach.vercel.app` domain.
- Production `GOOGLE_REDIRECT_URI` value.
- Production hostnames in OG / Twitter card metadata
  (`src/app/layout.tsx` still references `kohler-outreach.vercel.app` —
  preserved on purpose so OG cards always reach prod).

## Recommended release order

1. Apply all five migrations to production (single transaction or one at a time).
2. Set `NEXT_PUBLIC_APP_ENV=production` and confirm the env badge reads
   `PRODUCTION`.
3. Deploy the new code from this branch.
4. Run smoke tests above.
5. Run `POST /api/jobs/rescore { all_relevant: true, limit: 500 }` once
   to backfill scores on existing jobs.
6. Run `POST /api/gmail/backfill-responses` with a 90-day window to
   populate `email_threads` / `email_messages` for the existing
   outreach history.
7. Add a `vercel.json` cron entry for `/api/gmail/sync-incremental`
   (e.g. `"30 13 * * *"` — 7:30 AM MDT) once the backfill confirms the
   classifier works on real mail.
8. Leave `ENABLE_LIVE_SEND=false` until Kohler manually approves the
   first batch of drafts in the UI.

## Open follow-ups for next agent run

- Add per-company timeline view on `/dashboard` (jobs → contacts →
  drafts → sent → reply → application → follow-up).
- Migrate the legacy `/api/find-email`, `/api/research-contacts`, and
  `/api/cron/research` routes onto `getContactProvider()` so the new
  enrichment columns get populated by every flow.
- Hook `persistNormalizedJobs` into `/api/jobs/rescore` so every newly
  ingested job gets a fit score on insert.
- Add a "Create draft" button to each command-center row that calls
  `/api/outreach/create-draft` with the right `recommended_action`.
- Refactor existing `/api/ingest/ziprecruiter` to share
  `src/lib/jobIngest/normalization.ts` helpers (currently duplicated).
