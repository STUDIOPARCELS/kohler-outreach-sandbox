# Sandbox Current State — Kohler Outreach Engine

> Baseline map of `kohler-outreach-claude-sandbox` (Claude's working copy, cloned
> from `STUDIOPARCELS/kohler-outreach-sandbox` at commit `013115e`).
> Generated 2026-05-14. Updated as the engine evolves.

This document describes what exists today, before the Phase 2+ work begins. It
is the reference Claude uses when deciding the next highest-leverage change.

---

## 1. Framework / runtime

- **Framework:** Next.js 14 (App Router), TypeScript, Tailwind CSS.
- **Server runtime:** Vercel serverless functions (Node).
- **Data:** Supabase Postgres accessed via service-role key on the server.
- **Email:** Direct Gmail API (`googleapis`) plus `nodemailer` for SMTP send;
  `resend` is in `package.json` but not currently imported in `src/`.
- **Cron:** Vercel cron (`vercel.json`) drives sandbox career-page ingest and
  contact-research; production ingest runs on Supabase `pg_cron`
  (see [docs/deploy-map.md](deploy-map.md)).
- **Frontend:** server components + a few client components; Tailwind utility
  styling; `Nav`, `DarkMode`, `Toast` shared components.

## 2. Pages / routes

| Path | File | Purpose |
| --- | --- | --- |
| `/` | [src/app/page.tsx](../src/app/page.tsx) | Landing dashboard (currently links into the rest of the app). |
| `/open-roles` | [src/app/open-roles/page.tsx](../src/app/open-roles/page.tsx) | Today's relevant roles fed from `/api/open-roles-list`. |
| `/outreach-list` | [src/app/outreach-list/page.tsx](../src/app/outreach-list/page.tsx) | Companies without open roles, eligible for letter outreach. |
| `/queue` | [src/app/queue/page.tsx](../src/app/queue/page.tsx) | Letter / email draft queue with batch actions. |
| `/template` | [src/app/template/page.tsx](../src/app/template/page.tsx) | Letter template editor with preview. |
| `/followups` | [src/app/followups/page.tsx](../src/app/followups/page.tsx) | Follow-up candidates and approval flow. |
| `/company/[companyname]` | [src/app/company/[companyname]/page.tsx](../src/app/company/[companyname]/page.tsx) | Per-company detail with contacts and drafts. |
| `/print/letters` | [src/app/print/letters/page.tsx](../src/app/print/letters/page.tsx) | Batch-print letters with page breaks. |
| `/print/envelopes` | [src/app/print/envelopes/page.tsx](../src/app/print/envelopes/page.tsx) | Batch-print #10 envelopes. |
| Layout | [src/app/layout.tsx](../src/app/layout.tsx) | Root layout, OG tags, Nav, Toast, DarkMode. |

## 3. API routes (40 files under `src/app/api`)

Grouped by purpose. All routes share the service-role `supabaseAdmin` client.

### Companies
- `GET /api/company` — fetch companies.
- `POST /api/delete-company` — soft delete (writes to `companies`, `contacts`, `reachout_company_inserts`, `tracking`).
- `POST /api/restore-company` — restore from soft delete.
- `GET /api/outreach-list` — companies eligible for letter outreach (joins `companies`, `job_listings`, `contacts`).
- `GET /api/data-audit` — counts across `temp_company_addresses`, `companies`, `tier_1_4_contacts`, `candidate_profile`.

### Contacts
- `GET /api/contacts` — list contacts.
- `GET /api/alt-contacts` — alternate contact list view.
- `POST /api/find-email` — RocketReach lookup, updates `contacts` + `reachout_company_inserts`.
- `POST /api/find-leads` — RocketReach + Google Places lead generation.
- `POST /api/clean-emails` — normalize email rows.
- `POST /api/backfill-emails` — bulk RocketReach email backfill.
- `POST /api/research-contacts` — find contacts for a company via RocketReach.
- `POST /api/batch-research` — multi-company research batch.
- `GET /api/batch-status` — batch progress.
- `POST /api/merge-data` — merge `temp_company_addresses` and `tier_1_4_contacts` into canonical tables.

### Job ingest
- `POST /api/ingest/ziprecruiter` — **parser v5** body-based ZipRecruiter email parser. Reads Gmail, writes `job_listings` + `job_ingest_runs`, updates `gmail_accounts.last_history_id`.
- `POST /api/ingest/careers` — sandbox-only Vercel-cron careers/USAJOBS/Built In ingest. Writes `job_listings`, reads `companies`.
- `POST /api/import-ziprecruiter` — manual ZipRecruiter import to `jobs` table (legacy).

### Job query
- `GET /api/open-roles-list` — Open Roles feed: filters `job_listings` where `is_relevant=true`, hydrates with `companies` + `contacts`.
- `GET /api/relevant-roles` — relevant-only listing.
- `GET /api/search-jobs` — keyword job search; can call OpenAI for ranking.

### Backfill / repair
- `POST /api/backfill-addresses` — Google Places address backfill into `companies`.
- `POST /api/backfill-careers-urls` — discover careers URLs via OpenAI and write to `companies`.

### Outreach drafts and letters
- `GET/POST /api/draft` — load/save per-company draft on `reachout_company_inserts`.
- `POST /api/queue` — batch-status query / queue actions on `reachout_company_inserts`.
- `GET /api/template` — read letter template; `POST /api/fix-template` repairs template rows.
- `POST /api/save-signature` — store signature image in `candidate_assets`.
- `POST /api/candidate-profile` — read/write `candidate_profile`.

### Follow-ups
- `GET /api/followup-candidates` — eligible follow-up rows.
- `POST /api/update-followup-email` — update follow-up draft.
- `POST /api/approve-followup` — approve + send follow-up via Gmail API; writes `tracking` row.

### Email send
- `POST /api/send-email` — send outreach email via SMTP (nodemailer + GMAIL_APP_PASSWORD); writes to `tracking` and updates `reachout_company_inserts`.

### Google integration
- `GET /api/google/connect` — OAuth start.
- `GET /api/google/callback` — OAuth code exchange; upserts `gmail_accounts`.

### Other
- `GET /api/health` — DB health check (selects from `companies`).
- `POST /api/match-skills` — Claude-powered candidate-skill matching.
- `POST /api/company-descriptions` — bulk OpenAI company description generation.
- `POST /api/search-places` — Google Places search.
- `POST /api/cron/research` — daily research cron job, writes `contacts` + `reachout_company_inserts`.

## 4. Library helpers

| File | Role |
| --- | --- |
| [src/lib/supabaseAdmin.ts](../src/lib/supabaseAdmin.ts) | Single shared service-role Supabase client. Prefers `KOHLER_SUPABASE_URL/KEY`; falls back to `SUPABASE_URL/SERVICE_ROLE_KEY`. Uses `cache: "no-store"` so reads are always live. |
| [src/lib/auth.ts](../src/lib/auth.ts) | Three guards: `requireAppOrigin` (browser-origin allowlist), `requireApiSecret` (`X-API-SECRET`), `requireCronSecret` (`Authorization: Bearer <CRON_SECRET>`). Allowed origins are hardcoded to prod + sandbox + localhost. |
| [src/lib/googleAuth.ts](../src/lib/googleAuth.ts) | OAuth2 client builder + helper that loads stored Gmail tokens from `gmail_accounts` and refreshes them. Default callback URI is hardcoded to **production** (`kohler-outreach.vercel.app/api/google/callback`). |
| [src/lib/jobLinks.ts](../src/lib/jobLinks.ts) | Heuristics for cleaning ZipRecruiter / Indeed / generic apply URLs. |
| [src/lib/targeting.ts](../src/lib/targeting.ts) | Niche taxonomy, staffing-agency exclusions, seniority/non-engineer title filters, generic-URL detection, **`scoreTargetRole`** boosts/penalties (EIT +40, mechanical engineer +34, MEP +32, Colorado +16, etc.), and `isTodayTargetJob` predicate. Threshold `match_score >= 24` plus a target-title boost is required for `is_relevant`. |
| [src/lib/outreachScore.ts](../src/lib/outreachScore.ts) | Company-level outreach score (0–100, label Hot/Strong/Warm/Low) using Lakewood ZIP `80226` distance, niche points, contact/email counts, careers-url, tier, and Mines-alumni count. ZIP→lat/lng table lives here. |

## 5. Components

| Component | Role |
| --- | --- |
| [src/components/Nav.tsx](../src/components/Nav.tsx) | Top-of-page navigation with links to all main pages. |
| [src/components/DarkMode.tsx](../src/components/DarkMode.tsx) | Dark-mode toggle that persists to local storage. |
| [src/components/Toast.tsx](../src/components/Toast.tsx) | Toast provider for success / error / info messages. |

## 6. Supabase tables / views referenced in code

Verified by grepping `.from("…")` in `src/`. Each is either a direct read or write today.

| Table | Used by |
| --- | --- |
| `companies` | `/api/company`, `/api/health`, `/api/outreach-list`, `/api/data-audit`, `/api/find-leads`, `/api/backfill-addresses`, `/api/backfill-careers-urls`, `/api/delete-company`, `/api/restore-company`, `/api/merge-data`, `/api/cron/research`, `/api/ingest/ziprecruiter`, `/api/ingest/careers`, `/api/queue`, `/api/search-jobs` |
| `contacts` | `/api/contacts`, `/api/alt-contacts`, `/api/find-email`, `/api/find-leads`, `/api/backfill-emails`, `/api/clean-emails`, `/api/research-contacts`, `/api/batch-research`, `/api/cron/research`, `/api/merge-data`, `/api/delete-company`, `/api/restore-company`, `/api/update-followup-email`, `/api/outreach-list`, `/api/open-roles-list` |
| `reachout_company_inserts` | `/api/draft`, `/api/queue`, `/api/approve-followup`, `/api/backfill-emails`, `/api/batch-status`, `/api/batch-research`, `/api/cron/research`, `/api/merge-data`, `/api/delete-company`, `/api/restore-company`, `/api/find-email`, `/api/followup-candidates`, `/api/research-contacts`, `/api/send-email`, `/api/update-followup-email` |
| `reachout_template` | `/api/template`, `/api/fix-template` |
| `tracking` | `/api/approve-followup`, `/api/send-email`, `/api/delete-company` |
| `gmail_accounts` | `src/lib/googleAuth.ts`, `/api/google/callback`, `/api/ingest/ziprecruiter` |
| `job_listings` | `/api/ingest/ziprecruiter`, `/api/ingest/careers`, `/api/open-roles-list`, `/api/relevant-roles`, `/api/search-jobs`, `/api/outreach-list` |
| `job_ingest_runs` | `/api/ingest/ziprecruiter` |
| `jobs` | `/api/import-ziprecruiter` (legacy) |
| `candidate_profile` | `/api/candidate-profile`, `/api/data-audit` |
| `candidate_assets` | `/api/save-signature` |
| `temp_company_addresses` | `/api/data-audit`, `/api/merge-data` |
| `tier_1_4_contacts` | `/api/data-audit`, `/api/merge-data` |

## 7. Environment variables in use

Verified by grepping `process.env.*`.

| Variable | Used in | Notes |
| --- | --- | --- |
| `KOHLER_SUPABASE_URL` | `supabaseAdmin.ts` | preferred Supabase URL (immune to Vercel/Supabase integration overrides) |
| `KOHLER_SUPABASE_KEY` | `supabaseAdmin.ts` | preferred Supabase service role key |
| `SUPABASE_URL` | `supabaseAdmin.ts` | fallback Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabaseAdmin.ts` | fallback service role key |
| `NODE_ENV` | `auth.ts` | development bypass for `requireAppOrigin` |
| `API_SECRET` | `auth.ts` | gate for admin routes (`X-API-SECRET`) |
| `CRON_SECRET` | `auth.ts`, `ingest/careers` | Vercel cron Bearer secret |
| `IMPORT_SECRET` | `import-ziprecruiter`, `ingest/ziprecruiter`, `ingest/careers` | manual import + ingest fallback |
| `INGEST_SECRET` | `ingest/ziprecruiter`, `ingest/careers` | preferred ingest secret |
| `GOOGLE_CLIENT_ID` | `googleAuth.ts` | OAuth client |
| `GOOGLE_CLIENT_SECRET` | `googleAuth.ts` | OAuth secret |
| `GOOGLE_REDIRECT_URI` | `googleAuth.ts` | OAuth callback (defaults to **production** URL) |
| `GOOGLE_PLACES_API_KEY` | `backfill-addresses`, `find-leads`, `search-places` | Google Places lookups |
| `ROCKETREACH_API_KEY` | `find-email`, `find-leads`, `backfill-emails`, `batch-research`, `research-contacts`, `cron/research` | RocketReach API |
| `OPENAI_API_KEY` | `backfill-careers-urls`, `company-descriptions`, `search-jobs`, `research-contacts` | OpenAI calls |
| `ANTHROPIC_API_KEY` | `match-skills` | Claude calls |
| `GMAIL_USER` | `send-email`, `approve-followup` | SMTP user |
| `GMAIL_APP_PASSWORD` | `send-email`, `approve-followup` | SMTP app password |
| `REPLY_TO_EMAIL` | `send-email`, `approve-followup` | defaults to `akwood1@mines.edu` |
| `USAJOBS_AUTHORIZATION_KEY` / `USAJOBS_API_KEY` | `ingest/careers` | optional USAJOBS source |
| `USAJOBS_USER_AGENT` / `USAJOBS_EMAIL` | `ingest/careers` | required `User-Agent` for USAJOBS |

**Missing for goal state** (need to add):
- `NEXT_PUBLIC_APP_ENV` and/or rely on `VERCEL_ENV` — needed by Phase 2 environment badge.
- `ENABLE_LIVE_SEND` — Phase 9 gate for Gmail send.
- `KOHLER_PORTFOLIO_URL` — defaults to `kohler.solokit.app` for Phase 8 templates.
- `KOHLER_RESUME_URL` — résumé link for Phase 8 templates.

## 8. Current Open Roles data path

1. Vercel cron hits `POST /api/ingest/careers` Tue/Fri at `15 14 * * 2,5` UTC
   (sandbox only) with `Authorization: Bearer <CRON_SECRET>`.
2. Supabase `pg_cron` hits `POST /api/ingest/ziprecruiter` daily at `0 14 * * *`
   UTC against the production deployment (per `docs/deploy-map.md`).
3. Both routes parse jobs, score them with `scoreTargetRole`
   (in [src/lib/targeting.ts](../src/lib/targeting.ts)), and write to
   `job_listings` (with `is_relevant`, `match_score`, `relevance_reason`).
4. `GET /api/open-roles-list` returns `is_relevant=true` rows joined with
   companies and contacts, additionally filtered by
   `isTodayTargetJob(...)`.
5. `/open-roles` page renders the list with niche, distance, and per-company
   roll-ups.

## 9. Current Gmail / outreach paths

- **Inbound:** `ingest/ziprecruiter` reads job-alert emails via `googleapis` —
  `users.history.list` with stored `last_history_id` per Gmail account; falls
  back to full sync if Gmail returns 404.
- **Outbound (letter):** `/queue` and `/print/letters` produce printable
  letters from `reachout_company_inserts` rows; physical mail.
- **Outbound (email):** `/api/send-email` sends an HTML email via Nodemailer
  + Gmail SMTP, signs with the hosted signature image, writes a `tracking`
  row, and updates the draft status. Uses `GMAIL_APP_PASSWORD`, NOT OAuth.
- **Outbound (followup):** `/api/approve-followup` repeats the same SMTP path
  for follow-ups.
- **No reply ingest yet.** The `tracking` table stores send events, but no
  route fetches Gmail replies, classifies them, or links them back to a
  `reachout_company_inserts` thread.

## 10. ZipRecruiter / careers parser logic

- Parser identifier: **v5** (body-based extraction). Lives in
  [src/app/api/ingest/ziprecruiter/route.ts](../src/app/api/ingest/ziprecruiter/route.ts).
- Extracts title, company, location, salary, apply URL from email bodies and
  strips script/style.
- Calls `scoreTargetRole(...)` to compute `match_score` and `relevance_reason`,
  setting `is_relevant = match_score >= 24` plus a target-title hit.
- Persists `gmail_message_id` on `job_listings` to enforce idempotency.
- Maintains per-account `last_history_id` cursor on `gmail_accounts`.
- Career-page parser in
  [src/app/api/ingest/careers/route.ts](../src/app/api/ingest/careers/route.ts)
  fetches direct careers URLs, Built In Colorado, GovernmentJobs, and optional
  USAJOBS; same scoring + dedupe.

## 11. Scheduler / cron assumptions

- `vercel.json` declares `/api/cron/research` daily at 08:00 UTC and
  `/api/ingest/careers` Tue/Fri 14:15 UTC.
- Production `kohler-outreach` deployment uses Supabase `pg_cron` at 14:00 UTC
  for `/api/ingest/ziprecruiter`.
- DST drift of one hour is accepted (per `docs/deploy-map.md`).

## 12. Vercel assumptions

- The sandbox is deployed to `kohler-outreach-sandbox.vercel.app`.
- Production is `kohler-outreach.vercel.app`.
- Allowed origins in [src/lib/auth.ts](../src/lib/auth.ts) are hardcoded to
  both plus localhost.
- `GOOGLE_REDIRECT_URI` defaults to the production URL — local/sandbox OAuth
  requires the env var to be set explicitly.

## 13. RocketReach usage

- Already wired in `find-email`, `find-leads`, `backfill-emails`,
  `batch-research`, `research-contacts`, and `cron/research`.
- All call RocketReach via raw fetch with `Api-Key` header, no shared adapter.
- Phase 7 will introduce a contact-provider adapter wrapping these and a
  mock provider when the API key is absent.

## 14. Existing outreach / contact / application features

- **Outreach drafts:** rows on `reachout_company_inserts` with status flow
  (draft → ready → printed/sent). UI on `/queue`.
- **Contacts:** flat `contacts` table with `email`, `email_searched`,
  `companyname`, etc. No structured `is_mines_alumni` / `role_type` /
  `seniority` / `department` / `is_possible_pe` fields yet.
- **Applications:** no dedicated `applications` table today; `tracking` records
  send events only.

## 15. References to production inside sandbox code

Hardcoded production references in this repo:

- [src/lib/auth.ts:4](../src/lib/auth.ts) — `kohler-outreach.vercel.app` in
  the allowed-origin list (kept; sandbox is also in that list).
- [src/lib/googleAuth.ts:9](../src/lib/googleAuth.ts) — default OAuth callback.
- [src/app/layout.tsx:12,16,28](../src/app/layout.tsx) — OG / Twitter URLs all
  point at production.
- [src/app/api/approve-followup/route.ts:9,45](../src/app/api/approve-followup/route.ts) — host fallback to sandbox host; signature image hardcoded to production URL.
- [src/app/api/google/callback/route.ts:65](../src/app/api/google/callback/route.ts) — `req.nextUrl.origin` first, then production fallback.
- [src/app/api/send-email/route.ts:8,64](../src/app/api/send-email/route.ts) — host fallback to production; signature image hardcoded.
- [scripts/verify-job-links.mjs:1](../scripts/verify-job-links.mjs) — defaults to sandbox URL via `KOHLER_SANDBOX_URL`.
- [docs/deploy-map.md](deploy-map.md) — operational doc references both.

These are tracked here so Phase 12 can rewrite them at promotion time without
hunting for them.

## 16. Existing tests

- [scripts/verify-job-links.mjs](../scripts/verify-job-links.mjs) — black-box
  job-link verifier that hits the deployed sandbox.
- No unit tests under `src/`. No `npm test` script.

## 17. Gaps between current sandbox and goal state

The 12-phase mission needs the following additions or upgrades. Each becomes
work in subsequent phases.

| Goal-state need | Status today |
| --- | --- |
| Runtime environment badge (sandbox / preview / production) | **missing** — addressed in Phase 2. |
| Job-source provenance (`job_sources`, `sync_runs`, `parser_version`, `source_url`, `external_job_id`, `normalized_hash`, `first_seen_at`, `last_seen_at`, `closed_at`, `raw_payload`, `ingest_status`) | partial — `job_ingest_runs` exists for ZipRecruiter only; `job_listings` has `is_relevant` but no full provenance schema. Phase 3. |
| Pluggable job-source adapter interface | **missing** — current ingest is per-route. Phase 4. |
| Kohler fit scoring stored per row (`role_fit_scores`) with skill/PE/niche subscores and explanation JSON | partial — `scoreTargetRole` returns one number; not persisted as a separate row. Phase 5. |
| Open Roles command-center UI (per-company roll-up, recommended action, contact + outreach status visible) | partial — list exists, contact/outreach status not wired in. Phase 6. |
| RocketReach contact intelligence (`role_type`, `seniority`, `is_mines_alumni`, `is_possible_pe`, `verified_at`, raw payload server-side) | partial — RocketReach used directly, schema doesn't carry the structured fields. Phase 7. |
| Outreach drafts beyond letters (`outreach_campaigns`, `outreach_actions`, `email_drafts`, `applications`, `letters`) with templates | partial — letter draft only. Phase 8. |
| Gmail draft creation, ENABLE_LIVE_SEND gating, reply backfill (`sent_messages`, `email_threads`, `email_messages`) | partial — only SMTP send + tracking rows. Phase 9. |
| Metrics dashboard (companies tracked, drafts ready, replies, response rate, follow-ups due) | **missing** — Phase 10. |
| Verification report and production promotion plan | seeded by this run — Phases 11 and 12. |

---

## Conventions for future phases

- **Additive only.** Migrations live under `supabase/migrations/` and never
  drop or rename existing columns.
- **Adapters everywhere external.** Every external-provider call (RocketReach,
  Gmail, USAJOBS, Greenhouse/Lever/Ashby boards) goes through a typed
  interface so mocks and tests work without credentials.
- **Server-only secrets.** Raw provider payloads stay on the server; the UI
  surfaces normalized fields only.
- **Human-reviewable outreach.** Default Gmail behavior is draft creation;
  `ENABLE_LIVE_SEND=true` plus `human_approved` draft status is required to
  send.
- **Source evidence visible.** Where the UI shows a job/contact, a link back
  to the source URL is preferred so Kohler can verify quickly.
