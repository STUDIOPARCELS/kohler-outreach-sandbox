# Sandbox Current State

Date: 2026-05-14

## Baseline

- Repo/deploy target: `kohler-outreach-sandbox`
- Local path: `D:\KOHLER database\_repos\kohler-outreach-sandbox`
- Vercel project: `kohler-outreach-sandbox` from `.vercel/project.json`
- Intended sandbox Supabase project: `Kohler Outreach Sandbox` (`nwsjgppkfducaikxsyvk`)
- Production-style Supabase project: `KOHLER OS` (`acwgirrldntjpzrhqmdh`)
- Framework/runtime: Next.js 14 App Router, React 18, TypeScript, Tailwind CSS
- Database/client: Supabase service-role client in `src/lib/supabaseAdmin.ts`
- External services referenced: Gmail OAuth/SMTP, RocketReach, Google Places, OpenAI, Anthropic, USAJOBS
- Package scripts: `dev`, `build`, `start`, `lint`, `test:fit`, `test:gmail`, `test:schema`

## Pages

- `/` main outreach CRM surface
- `/outreach-list` company outreach list
- `/open-roles` open roles command surface
- `/replies` Gmail reply and bounce review surface
- `/analytics` outreach performance dashboard
- `/queue` letters/drafts queue
- `/template` outreach template editor
- `/followups` email follow-up workflow
- `/company/[companyname]` company detail and draft management
- `/print/letters` batch letter print view
- `/print/envelopes` batch envelope print view

## API Routes

- Company/contact/data: `/api/company`, `/api/contacts`, `/api/research-contacts`, `/api/alt-contacts`, `/api/find-email`, `/api/find-leads`, `/api/search-places`, `/api/company-descriptions`, `/api/backfill-addresses`, `/api/backfill-emails`, `/api/clean-emails`, `/api/merge-data`, `/api/data-audit`, `/api/delete-company`, `/api/restore-company`
- Outreach/queue/email: `/api/draft`, `/api/template`, `/api/queue`, `/api/batch-status`, `/api/send-email`, `/api/approve-followup`, `/api/update-followup-email`, `/api/followup-candidates`, `/api/save-signature`, `/api/gmail/backfill-responses`, `/api/replies`, `/api/replies/manual-letter`, `/api/analytics`
- Job intelligence: `/api/open-roles-list`, `/api/relevant-roles`, `/api/search-jobs`, `/api/import-ziprecruiter`, `/api/ingest/ziprecruiter`, `/api/ingest/careers`, `/api/jobs/rescore`
- Auth/health/cron: `/api/google/connect`, `/api/google/callback`, `/api/health`, `/api/runtime-diagnostics`, `/api/cron/research`

## Supabase Tables/Views Referenced By Code

Production-style live schema source of truth:

- `docs/supabase-live-schema-inventory.md`
- `docs/supabase-live-schema-inventory.json`
- Queried from project `acwgirrldntjpzrhqmdh` through `information_schema.tables` and `information_schema.columns`.
- Current public schema count: 39 tables/views.

True sandbox live schema source of truth:

- `docs/supabase-true-sandbox-schema-inventory.md`
- `docs/supabase-true-sandbox-schema-inventory.json`
- Queried from project `nwsjgppkfducaikxsyvk`.
- Current public schema count: 13 tables/views.
- Row counts: `docs/supabase-true-sandbox-row-counts.json`.

- Core: `companies`, `contacts`, `candidate_profile`, `candidate_assets`
- Jobs: `job_listings`, `jobs`, `job_ingest_runs`
- Outreach: `reachout_company_inserts`, `reachout_template`, `reachout_final_letters`, `tracking`
- Gmail/OAuth: `gmail_accounts`
- Import/audit: `temp_company_addresses`, `tier_1_4_contacts`, `companies_backup_20260304`, `reno_deals`
- Storage bucket referenced: `outreach-assets`
- Additive migration applied to true sandbox project `nwsjgppkfducaikxsyvk`: `supabase/migrations/202605140001_job_intelligence_spine.sql`.
- Live-confirmed true-sandbox server-only tables with RLS enabled: `job_sources`, `sync_runs`, `role_fit_scores`, `outreach_actions`.
- Current true-sandbox counts after backfill: `role_fit_scores` 185, `job_sources` 0, `sync_runs` 0, `outreach_actions` 0.
- Additive Gmail analytics migration applied to true sandbox project `nwsjgppkfducaikxsyvk`: `supabase/migrations/202605140002_gmail_response_backfill.sql`.
- Live-confirmed true-sandbox server-only Gmail analytics tables with RLS enabled: `sent_messages`, `email_threads`, `email_messages`.
- Current true-sandbox Gmail analytics counts after IMAP backfill: `sent_messages` 33, `email_threads` 5, `email_messages` 5.

## Open Roles Data Path

1. `/api/ingest/ziprecruiter` imports Gmail alerts from ZipRecruiter and GovernmentJobs into `job_listings`.
2. `/api/ingest/careers` polls company career URLs and public ATS endpoints, then inserts/updates `job_listings`.
3. `/api/open-roles-list` reads relevant open/new rows from `job_listings`, enriches with `companies` and `contacts`, computes outreach and fit summaries, applies command-center filtering, and returns company cards.
4. `/api/relevant-roles` reads `job_listings` for one company and returns command-center-screened job rows for Open Roles expansion.
5. `/open-roles` renders grouped company cards and expanded job rows.

## Job Parser/Provider State

- ZipRecruiter/GovernmentJobs email parser version: `5`.
- Careers parser version: `1`.
- Direct ATS providers currently in `/api/ingest/careers`: Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Workday, Oracle Candidate Experience, iCIMS, JSON-LD, generic career links.
- Aggregate providers: Built In Colorado enabled; GovernmentJobs direct and USAJOBS are now gated behind `ENABLE_GOVERNMENT_JOB_SOURCES=true`.
- Duplicate handling is based on `source + external_job_key`; existing rows update `last_seen_at`, `times_seen`, and relevance fields.
- Provenance fields used where present: `source`, `external_job_key`, `gmail_message_id`, `job_url`, `apply_url`, `raw_payload`, `parser_version`, `first_seen_at`, `last_seen_at`, `times_seen`, `ingest_status`.

## Gmail State

- OAuth connection: `/api/google/connect` and `/api/google/callback`; token/cursor storage in `gmail_accounts`.
- Job ingest from Gmail: `/api/ingest/ziprecruiter`.
- Reply analytics: `/api/gmail/backfill-responses` is protected by `API_SECRET`, defaults to `dry_run=true`, scans known outreach contact emails plus non-generic company domains, skips automated career-site noise, classifies reply metadata, and writes only to `sent_messages`, `email_threads`, and `email_messages` when `dry_run=false`.
- Live SMTP routes: `/api/send-email` and `/api/approve-followup`.
- Safety gate added: live send now requires `ENABLE_LIVE_SEND=true` and the draft row status `human_approved`.
- Current OAuth status: one existing `gmail_accounts` row is present for `31***@gmail.com`; neither `kwood12802@gmail.com` nor `akwood1@mines.edu` is connected as of 2026-05-14. Historical reply/bounce backfill for Kohler's two mailboxes is blocked until those exact accounts are reconnected through `/api/google/connect`.
- Current outbound sync status: `sent_messages` has 33 server-side records from historical outbound rows, split into 8 email sends and 25 physical letters.
- Current reply/bounce backfill status: `scripts/gmail_imap_backfill.py` used the existing `GMAIL_USER=kwood12802@gmail.com` app password to read Gmail through IMAP for March 1-May 14, 2026. It scanned 28 contact emails and 24 company domains, skipped 5 automated ConMed career-site reminders, and imported 4 delivery-failure bounces plus 1 TruStile out-of-office auto-reply. No human/actionable replies were found.
- Reply/dashboard UI: `/replies` and `/analytics` exist and read from `sent_messages`, `email_threads`, and `email_messages`; they currently show 33 outbound records, 5 stored email events, 4 bounces, 1 out-of-office, 0 human replies, and a 12.1% bounce rate. `/replies` also includes a manual letter-reply form for responses Kohler receives outside a readable mailbox and a suppressed bounced-email panel with same-company replacement contact candidates where existing contact rows have alternate emails.
- Bounce suppression: `/api/send-email` and `/api/approve-followup` derive blocked recipients from `email_messages.classification = 'bounce'` and return 409 before Gmail SMTP if a future send targets one of those addresses.
- Missing: Gmail draft creation route and a successful Kohler-mailbox OAuth reconnect.

## Scheduler/Cron Assumptions

- `vercel.json` schedules:
  - `/api/cron/research` daily at `0 8 * * *`
  - `/api/ingest/careers` Tuesday/Friday at `15 14 * * 2,5`
- `/api/ingest/ziprecruiter` is secret-gated but not currently listed in `vercel.json`.
- `CRON_SECRET`, `INGEST_SECRET`, or `IMPORT_SECRET` are used by ingest routes.

## Environment Variables

Observed key names only, values intentionally redacted:

- Supabase: `KOHLER_SUPABASE_URL`, `KOHLER_SUPABASE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Auth/secrets: `API_SECRET`, `CRON_SECRET`, `IMPORT_SECRET`, `INGEST_SECRET`
- Gmail/Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `REPLY_TO_EMAIL`, `GOOGLE_PLACES_API_KEY`
- Providers/AI: `ROCKETREACH_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `USAJOBS_AUTHORIZATION_KEY`, `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT`, `USAJOBS_EMAIL`
- Runtime/safety: `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_TARGET_ENV`, `NEXT_PUBLIC_APP_ENV`, `APP_ENV`, `KOHLER_DEPLOY_TARGET`, `JOB_PARSER_VERSION`, `ENABLE_LIVE_SEND`, `ENABLE_GOVERNMENT_JOB_SOURCES`, `ENABLE_CONTACT_ENRICHMENT`

## RocketReach Usage

- `ROCKETREACH_API_KEY` is referenced in contact discovery and email lookup routes.
- Existing routes insert normalized contact rows into `contacts` and create draft records in `reachout_company_inserts`.
- Missing: explicit people-provider interface, raw payload isolation contract, company detail contact panel upgrades for confidence/source/role type.

## Production References Inside Sandbox Code

- `metadata.openGraph.url`, OG images, and some signature image URLs reference `kohler-outreach.vercel.app`.
- `googleAuth.ts` default redirect uses `https://kohler-outreach.vercel.app/api/google/callback` when `GOOGLE_REDIRECT_URI` is absent.
- Email signature assets in send routes reference production host for `KOHLER_SIGNATURE.png`.
- These should be reviewed before production promotion so sandbox and production identity are explicit.

## Gaps To Goal State

- Additive migration now exists and has been applied to the true sandbox for `job_sources`, `sync_runs`, `role_fit_scores`, and `outreach_actions`; all four tables have RLS enabled.
- No migrations yet for `contact_affiliations`, `outreach_campaigns`, `email_drafts`, `applications`, or `letters`.
- Runtime diagnostics exist and careers sync now attempts optional `sync_runs` persistence.
- Fit scoring exists as a server utility and Open Roles response enrichment. `POST /api/jobs/rescore` defaults to dry-run and has successfully persisted 185 true-sandbox rows into `role_fit_scores`.
- Open Roles now displays 161 screened jobs across 105 companies from 185 tracked relevant/open sandbox jobs, but still lacks direct actions for find contacts, create draft, mark applied, and monitor.
- RocketReach flow exists as direct routes, not yet behind a provider interface.
- Gmail reply backfill/classification route and storage exist. OAuth backfill is still blocked until `kwood12802@gmail.com` and/or `akwood1@mines.edu` is connected in `gmail_accounts`, but IMAP backfill works with the existing Gmail app password for `kwood12802@gmail.com`.
- Metrics dashboard now exists at `/analytics`, with current real data from 33 outbound records plus 5 imported Gmail events. It separates email replies from manual letter replies when those are added.
- Production promotion requires schema decisions and environment review.

## Security Flagging Assessment

The likely triggers are behavioral, not the mere fact that target companies include government employers:

- Automated polling of many career pages/ATS endpoints can look like scraping if run too often or at high concurrency.
- GovernmentJobs/USAJOBS polling may draw attention because it touches public-sector domains, even when using public job endpoints.
- Live Gmail SMTP sends from the app can look like automated outreach if not explicitly human-approved.
- RocketReach/email enrichment calls can be sensitive because they involve people/contact discovery.

Current mitigation in this run:

- Government aggregate polling is opt-in with `ENABLE_GOVERNMENT_JOB_SOURCES=true`.
- Live Gmail send is opt-in with `ENABLE_LIVE_SEND=true` plus `human_approved` draft status.
- Bounced email addresses are blocked from future live sends until replaced or verified.
- Automatic RocketReach contact-enrichment cron is opt-in with `ENABLE_CONTACT_ENRICHMENT=true`.
- Runtime diagnostics expose safety-gate state in the UI. Use `NEXT_PUBLIC_APP_ENV=sandbox` or `KOHLER_DEPLOY_TARGET=sandbox` in the sandbox deployment for an explicit sandbox badge.
- No bypassing auth, CAPTCHAs, login walls, robots controls, or private systems was added.
