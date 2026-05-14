# Verification Report

Date: 2026-05-14

## Product Questions

1. Which target companies have new roles?
   - Status: partial.
   - Evidence: `/api/open-roles-list` reads open/new relevant rows from `job_listings`, groups by company, and reports 24h/7d/30d counts.
   - Missing: durable sync table for all providers and UI distinction between newly discovered and still-open roles.

2. Which roles fit Kohler best?
   - Status: partial.
   - Evidence: `src/lib/kohlerFitScore.ts` scores skill, entry-level, PE-track, niche, location, and Mines signals. `/api/relevant-roles` now returns fit scores. The true sandbox migration is applied to `nwsjgppkfducaikxsyvk`, and `POST /api/jobs/rescore` persisted 185 `role_fit_scores` rows with `dryRun=false`.
   - Missing: dashboard display of persisted score history.

3. Which roles support his PE-track path?
   - Status: partial.
   - Evidence: fit scoring highlights EIT, PE, supervised work, design calculations, stamped drawings, MEP, civil, water, environmental, geotech, and field engineering signals.
   - Missing: explicit UI highlighting of each PE phrase in source evidence.

4. Who is the best person to contact?
   - Status: partial.
   - Evidence: existing RocketReach routes populate `contacts`; Open Roles shows contact/email counts.
   - Missing: provider interface, contact ranking, Mines-alumni/PE flags, and normalized affiliations.

5. What is the next best action?
   - Status: partial.
   - Evidence: `scoreJobForKohler` returns `recommended_action`; Open Roles company cards and job rows show the action. `POST /api/gmail/backfill-responses` can classify historical replies as positive, recruiter screen, apply online, referral, follow-up, rejection, bounce, out-of-office, auto-reply, or unknown after Gmail reconnect. `/replies` and `/analytics` now read real outbound analytics from `sent_messages`.
   - Missing: action queue UI, draft/contact/application buttons, and successful Kohler-mailbox reply import.

## Checks

- True sandbox schema inventory: passed via Supabase SQL editor against `information_schema.tables` and `information_schema.columns`; 13 public tables/views recorded in `docs/supabase-true-sandbox-schema-inventory.json` before additive migration.
- Production-style schema inventory: passed via Supabase SQL editor against `information_schema.tables` and `information_schema.columns`; 39 public tables/views recorded in `docs/supabase-live-schema-inventory.json`.
- `npm run test:fit`: passed.
- `npm run test:schema`: passed.
- `npm run test:gmail`: passed.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Local production smoke test: passed for `http://localhost:3000/open-roles`, `/api/open-roles-list`, and `/api/runtime-diagnostics` with app origin.
- Protected rescore route smoke: passed for `POST /api/jobs/rescore` with `{ "dryRun": true, "limit": 3 }`.
- Protected rescore write smoke: passed for `POST /api/jobs/rescore` with `{ "dryRun": false, "limit": 1000 }`; 185 true-sandbox rows persisted and `missingTable=false`.
- Supabase table verification: `job_sources`, `sync_runs`, `role_fit_scores`, and `outreach_actions` exist in true sandbox; `role_fit_scores` count is 185.
- Supabase Gmail analytics table verification: `sent_messages`, `email_threads`, and `email_messages` exist in true sandbox with RLS enabled. `sent_messages` now contains 33 historical outbound records; `email_threads` and `email_messages` remain 0 because mailbox OAuth is not connected for Kohler.
- Gmail OAuth smoke test: blocked for the requested Kohler mailboxes. The only `gmail_accounts` row is `31***@gmail.com`; `kwood12802@gmail.com` and `akwood1@mines.edu` are not connected. Reconnect the requested mailbox or mailboxes at `/api/google/connect` before running reply import.
- Gmail backfill route smoke: passed safety behavior. `POST /api/gmail/backfill-responses` with `dry_run=true`, `start_date=2026-03-01`, `end_date=2026-05-14`, and the two requested mailboxes returns 401 plus reconnect guidance. `dry_run=false` also returns reconnect guidance, but synced 33 outbound rows into `sent_messages` independently of Gmail reply access.
- Replies/analytics UI smoke: passed in the local browser. `/replies` shows 33 outbound records and no imported replies. `/analytics` shows 33 outbound, 8 email, 25 letters, 0 replies, 0 bounces, and 0% response/bounce rates.
- Runtime diagnostics smoke: passed; `/api/runtime-diagnostics` shows `appEnvironment=sandbox`, `supabaseProjectRef=nwsjgppkfducaikxsyvk`, 185 tracked jobs, 123 tracked companies, Gmail cursor set, safety gates off, and latest ingest run status from `job_ingest_runs.started_at`.
- Open Roles API smoke: passed; `/api/open-roles-list` returns 161 screened jobs across 105 companies after command-center filtering.
- Browser UI smoke: passed at `http://localhost:3000/open-roles`; page shows `SANDBOX`, safety gates off, sandbox Supabase project ref, 161 visible jobs, 105 visible companies, and relevance-aware Fit/PE chips across MEP, government, construction, aerospace, and manufacturing groups.
- `npm run lint`: not completed because the project has no ESLint config and Next.js opened its interactive setup prompt.

## Current Known Risks

- Existing local worktree had uncommitted edits before this run; those were preserved.
- The production-style project `acwgirrldntjpzrhqmdh` also received the additive migration and a 273-row fit-score backfill before true sandbox discovery. Treat it as production data during future promotion work.
- Vercel env vars are updated for the sandbox project, but a new deployment is still required before the hosted Vercel site uses the new env values and code changes.
- `npm run lint` may be limited by Next.js lint availability in Next 14.
- Gmail response backfill storage, route, `/replies`, and `/analytics` are implemented, but real Gmail scanning is blocked until the requested Kohler mailboxes are connected. Gmail draft creation is not yet implemented.
