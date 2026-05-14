# Production Promotion Plan

Date: 2026-05-14

## Sandbox Features Candidate For Promotion

- Runtime environment diagnostics and sandbox badge.
- Kohler fit scoring utility and Open Roles fit/action metadata.
- Live-send safety gate requiring `ENABLE_LIVE_SEND=true` and `human_approved` status.
- Government aggregate polling gate requiring `ENABLE_GOVERNMENT_JOB_SOURCES=true`.
- Current direct ATS ingestion improvements already present in the sandbox worktree.

## Migrations Required Before Full Promotion

Applied in the true sandbox Supabase project `nwsjgppkfducaikxsyvk`: `supabase/migrations/202605140001_job_intelligence_spine.sql`.

The same additive migration was also applied to production-style project `acwgirrldntjpzrhqmdh` earlier in the run before the separate true-sandbox project was discovered. Verify production migration history before promotion rather than assuming it needs to be re-applied.

- `job_sources`
- `sync_runs`
- `role_fit_scores`
- `outreach_actions`

All four tables have Row Level Security enabled and are intended for server-side access through service-role routes.

True sandbox backfill completed for `role_fit_scores` with 185 current relevant open jobs.

Still proposed for later approval:

- `contact_affiliations`
- `outreach_campaigns`
- `email_drafts`
- `sent_messages`
- `email_threads`
- `email_messages`
- `applications`
- `letters`

## Environment Variables Required

- Required core: `KOHLER_SUPABASE_URL`, `KOHLER_SUPABASE_KEY` or `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Auth/cron: `API_SECRET`, `CRON_SECRET`, `INGEST_SECRET`, `IMPORT_SECRET`
- Gmail OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Gmail live send: `ENABLE_LIVE_SEND=true`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `REPLY_TO_EMAIL`
- Contact enrichment: `ENABLE_CONTACT_ENRICHMENT=true`, `ROCKETREACH_API_KEY`
- Job/search helpers: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`
- Government job sources: `ENABLE_GOVERNMENT_JOB_SOURCES=true`, `USAJOBS_AUTHORIZATION_KEY`, `USAJOBS_USER_AGENT` or `USAJOBS_EMAIL`
- Runtime label: `NEXT_PUBLIC_APP_ENV=production` for production and `NEXT_PUBLIC_APP_ENV=sandbox` or `KOHLER_DEPLOY_TARGET=sandbox` for sandbox

Sandbox Vercel env check on 2026-05-14:

- `KOHLER_SUPABASE_URL`: present
- `KOHLER_SUPABASE_KEY`: present
- `SUPABASE_SERVICE_ROLE_KEY`: present
- `API_SECRET`: present
- `NEXT_PUBLIC_APP_ENV=sandbox`: present
- Supabase env values now target `nwsjgppkfducaikxsyvk`; Vercel reports a new deployment is needed for changes to take effect.
- Safety flags remain absent/off: `ENABLE_LIVE_SEND`, `ENABLE_GOVERNMENT_JOB_SOURCES`, `ENABLE_CONTACT_ENRICHMENT`

## Production Routes Affected

- `/open-roles`
- `/api/open-roles-list`
- `/api/relevant-roles`
- `/api/jobs/rescore`
- `/api/runtime-diagnostics`
- `/api/send-email`
- `/api/approve-followup`
- `/api/ingest/careers`

## Rollback Path

1. Keep production env `ENABLE_LIVE_SEND` unset or false to block live sends.
2. Keep production env `ENABLE_GOVERNMENT_JOB_SOURCES` unset or false to avoid government aggregate polling.
3. Revert UI changes to `/open-roles` if diagnostics or fit metadata causes rendering issues.
4. Revert route imports for `scoreJobForKohler` if API responses need to return to prior shape.
5. Disable `/api/ingest/careers` cron in Vercel only after deployment-setting approval.

## Smoke Test Checklist

- Visit `/open-roles`; confirm environment badge shows the expected target.
- Call `/api/runtime-diagnostics` from the app origin; confirm no secrets are returned.
- Expand a company in Open Roles; confirm fit score, PE score, source, and next action render.
- Try live send with `ENABLE_LIVE_SEND` unset; confirm 403.
- Try live send with non-`human_approved` status; confirm 409.
- Run careers ingest in dry-run mode before enabling production cron behavior.

## Data Validation Queries

Run in Supabase SQL editor after schema changes:

```sql
select source, ingest_status, count(*)
from job_listings
group by source, ingest_status
order by count(*) desc;

select companyname, count(*) as open_roles
from job_listings
where ingest_status in ('new', 'open') and is_relevant = true
group by companyname
order by open_roles desc;

select status, count(*)
from reachout_company_inserts
group by status
order by count(*) desc;
```

## Recommended Release Order

1. Promote diagnostics and safety gates.
2. Promote fit scoring display.
3. Confirm production migration history against `acwgirrldntjpzrhqmdh` before applying anything to production.
4. Backfill fit scores from current production `job_listings` with `POST /api/jobs/rescore` and `dryRun=false` only after promotion approval.
5. Enable Gmail draft creation and reply backfill.
6. Enable contact-provider interface and RocketReach normalization.
7. Enable government aggregate polling only after security review.
8. Enable live send only after a human approval workflow is verified.
