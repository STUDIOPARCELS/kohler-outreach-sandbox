# Architecture

Date: 2026-05-14

## Current Spine

```text
companies
  -> career URLs / Gmail alerts / public ATS sources
  -> job_listings
  -> relevance and Kohler fit scoring
  -> contacts
  -> reachout_company_inserts
  -> Gmail SMTP / print workflows
  -> tracking and follow-up views
```

## Target Spine

```text
Company targets
  -> job_sources
  -> sync_runs
  -> job_listings
  -> role_fit_scores
  -> contacts + contact_affiliations
  -> outreach_campaigns + outreach_actions
  -> email_drafts
  -> sent_messages
  -> email_threads + email_messages
  -> applications + letters
  -> response dashboard + next actions
```

## Server Utilities

- `src/lib/supabaseAdmin.ts`: service-role Supabase client. Server-only.
- `src/lib/auth.ts`: origin, API secret, and cron secret guards.
- `src/lib/googleAuth.ts`: Gmail OAuth client and token refresh.
- `src/lib/targeting.ts`: job/niche filters and current relevance scoring.
- `src/lib/outreachScore.ts`: company outreach priority score.
- `src/lib/jobLinks.ts`: reliable/direct job URL checks.
- `src/lib/runtimeEnvironment.ts`: server-safe environment detection and parser/safety metadata.
- `src/lib/kohlerFitScore.ts`: Kohler-specific job fit scoring and recommended next action.
- `src/lib/gmailResponseBackfill.ts`: Gmail reply classification, email normalization, and outreach matching helpers.
- `src/lib/outreachSafety.ts`: live-send approval gates.
- `src/lib/roleFitScoreStore.ts`: persistence for Kohler fit scores in `role_fit_scores`, with graceful missing-table fallback.
- `src/lib/syncRunStore.ts`: persistence for ingest attempts in `sync_runs`, with graceful missing-table fallback.
- `src/lib/optionalDb.ts`: helper for graceful behavior if additive tables are absent in another environment.

## Data Contracts

- Live schema inventory must be read before migration or adapter work: `docs/supabase-live-schema-inventory.json`.
- Current job rows depend on `job_listings` fields: `companyname`, `company_id`, `title`, `salary`, `location`, `employment_type`, `source`, `external_job_key`, `gmail_message_id`, `job_url`, `apply_url`, `received_at`, `first_seen_at`, `last_seen_at`, `times_seen`, `is_relevant`, `match_score`, `relevance_reason`, `raw_payload`, `ingest_status`, `parser_version`.
- Current outreach rows depend on `reachout_company_inserts` fields including `companyname`, `contactname`, `contact_title`, `contact_email`, `subject_final`, `body_final`, `status`, `printed_at`, `sent_at`, `emailed_at`, `followup2_at`, and job context fields where present.
- Current contacts depend on name/title/email/company fields. Contact confidence/source/role-type fields are not yet guaranteed by schema.
- Applied sandbox migration `supabase/migrations/202605140001_job_intelligence_spine.sql` adds `job_sources`, `sync_runs`, `role_fit_scores`, and `outreach_actions` without changing legacy tables. RLS is enabled on all four tables.
- Applied sandbox migration `supabase/migrations/202605140002_gmail_response_backfill.sql` adds `sent_messages`, `email_threads`, and `email_messages` without changing legacy tables. RLS is enabled on all three tables.

## Provider Boundaries

- Job providers are currently functions inside route files. They should be extracted into adapters only after behavior is stable.
- Contact providers are currently route-local RocketReach calls. They should be moved behind a people-provider interface before adding more providers.
- Gmail send is currently SMTP. Draft creation and reply sync should use Gmail API routes with explicit human approval state.
- `POST /api/jobs/rescore` is protected by `API_SECRET` and defaults to dry-run. It scores current `job_listings` and persists only when `dryRun=false`.
- `POST /api/gmail/backfill-responses` is protected by `API_SECRET` and defaults to dry-run. It syncs historical outbound rows into `sent_messages`, then matches Gmail replies to `reachout_company_inserts` by exact contact email or non-generic company domain with outreach evidence, skips automated career-site noise, and stores `email_threads`/`email_messages` only when `dry_run=false`.
- `GET /api/replies` is app-origin protected and returns imported reply/bounce records plus classification counts.
- `POST /api/replies/manual-letter` is app-origin protected and lets Kohler manually add a response received from a physical letter. It writes a manual `email_threads`/`email_messages` pair with `metadata.channel = "letter"` and no Gmail access requirement.
- `GET /api/analytics` is app-origin protected and returns response-rate cards from `sent_messages`, `email_threads`, and `email_messages`.

## Safety Defaults

- Live send is disabled unless `ENABLE_LIVE_SEND=true`.
- Draft status must be `human_approved` before live SMTP send.
- Government aggregate polling is disabled unless `ENABLE_GOVERNMENT_JOB_SOURCES=true`.
- Automatic RocketReach contact-enrichment cron is disabled unless `ENABLE_CONTACT_ENRICHMENT=true`.
- Runtime diagnostics must not return secrets or full provider credentials.
- Raw people-provider payloads should remain server-side.
