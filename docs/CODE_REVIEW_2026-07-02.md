# Full Code Review — Outreach Engine

Date: 2026-07-02. Scope: entire `kohler-outreach-sandbox` repo (46 API routes, all of `src/lib`, UI pages, scripts, docs, migrations) plus live evidence from the production Vercel project (`kohler-outreach`) and both Supabase projects. Production deploys from the separate `kohler-outreach` repo, which this sandbox mirrors; production-only routes (`/api/cron/orchestrator`, `/api/cron/jobs`, `/api/cron/news`) could not be read from here — only their runtime behavior.

## Verdict

The three symptoms — slow, not updating, daily fix-pushes — are all real, all diagnosable, and none of them are your machine.

| Symptom | Root causes (in order of contribution) |
|---|---|
| "Only updates when I push" | Cron route statically cached at build time (a push = rebuild = the one time it runs) · cron auth mismatches that 403 silently · Google OAuth disconnected since 6/17 · cron timeouts killing runs mid-batch |
| "Very very slow" | Dashboard blocks on 5 API calls in 3 serial stages · payloads that ship every letter body and grow forever · triple-sequential queries + regex-scoring every job twice per request, zero caching |
| "Every day I have to fix something" | Follow-up flow requires a status nothing ever sets (manual flip per send) · saves that silently fork duplicate rows · ~40 database writes whose errors are ignored · no CI, so every regression is discovered live |

## Live production evidence (last 7 days)

- **Cron timeouts:** `/api/cron/orchestrator`, `/api/cron/jobs`, `/api/cron/news`, `/api/cron/research` killed at the 300s (and 60s) Vercel limit, 9 occurrences, most recent 2026-07-02 11:58 UTC.
- **Ingest dead since 2026-06-17:** `/api/ingest/ziprecruiter` fails every scheduled run with "No Google account connected. Visit /api/google/connect first." Two weeks of job-alert emails unprocessed.

## P0 — why data stops updating

1. **`/api/cron/research` can be statically cached at build.** No `export const dynamic = "force-dynamic"`; the only request access is `requireCronSecret`, which returns *before touching headers* when `CRON_SECRET` is unset (`src/lib/auth.ts:66-69`, fail-open). Next 14 then freezes the handler's build-time response; every daily cron replays it as a 200 no-op. A push rebuilds and does one real chunk of work — the exact "updates only when I push" signature. Fix: `export const dynamic = "force-dynamic"; export const revalidate = 0;` and set `CRON_SECRET`.
2. **Careers cron can 403 forever, silently.** `src/app/api/ingest/careers/route.ts:55-60` checks the caller's token against `INGEST_SECRET || IMPORT_SECRET || CRON_SECRET` — first configured wins. Vercel cron sends `Bearer CRON_SECRET`; if `INGEST_SECRET` or `IMPORT_SECRET` differ, every scheduled run 403s while manual tests pass. Fix: accept a match against *any* configured secret; alert on cron 403/timeouts.
3. **Google OAuth is disconnected in production** (since 6/17). Reconnect via `/api/google/connect`. Related code bugs compound it: the OAuth callback's `gmail_accounts` upsert error is ignored (`google/callback/route.ts:51-62` — "connected" can be a lie), and the ziprecruiter ingest advances `last_history_id` *before* processing messages with no `history.list` pagination (`ingest/ziprecruiter/route.ts:636-656`) — any mid-run crash permanently skips those emails.
4. **The enrichment cron is a permanent no-op even when it runs:** gated by `ENABLE_CONTACT_ENRICHMENT=true`, documented as off (`docs/production-promotion-plan.md:63`).
5. **Timeout economics guarantee partial runs.** Research: fixed 2s sleeps × 20 companies + untimed RocketReach fetches ≈ 80-240s vs `maxDuration = 60`. Careers: up to 300 companies × ATS API fan-out + one serial URL check per job vs 300s, and the company list is fetched in fixed tier order with no rotation (`careers/route.ts:1071-1084`) — runs die at the same point, so the same tail of companies never refreshes. Production logs confirm timeouts today.
6. **Live jobs get marked "closed" on transient failures.** `isActivePostingUrl` returns false on any fetch error/timeout/bot-block (`careers/route.ts:158-165`) and the caller then flips the existing row to `ingest_status:"closed"` (`:886-889`). Every UI view filters closed rows out — jobs "vanish overnight." Its closed-text heuristic also matches "404" anywhere in SPA HTML. Fix: close only on positive closure-text match; treat errors as unknown.
7. **Permanent tombstones:** a company whose first RocketReach search returns empty gets a "(no results)" contact that counts as "has contact" forever (`cron/research/route.ts:112-130, 252-261`) — silently frozen out of enrichment for life.

## P0 — why you intervene manually every day

8. **Follow-up sends are wedged by design.** `approve-followup` requires `status === "human_approved"` (`outreachSafety.ts:1`), but no code path and no UI ever sets that status — printing sets `"sent"`, emailing sets `"emailed"`. Every follow-up 409s until you flip the status by hand, and the route flips it back after sending, so it recurs on follow-up #2. This alone plausibly explains the daily ritual.
9. **Opening the follow-up modal can destroy the original letter.** The modal autosaves its *generated follow-up text* into `body_final` on close/save/send (`followups/page.tsx:148, 416-419, 513-520`) — the full letter is silently overwritten with a 6-line blurb.
10. **`/api/draft` forks duplicates.** Lookup errors are ignored and `.maybeSingle()` errors once duplicates exist → every save inserts another row while the UI edits an older one (`draft/route.ts:44-64`); "reset letter" posts without `companyname`, 400s silently, and never clears `sent_at` — phantom rows live in /followups forever (`page.tsx:1262-1266`).
11. **~40 unchecked writes.** supabase-js never throws; dozens of mutations discard `{ error }` — including the post-send status update (`send-email/route.ts:215-218`): an email can go out, the row still looks unsent, and you re-send. Full list in the review transcript; the pattern is systemic. Fix: a small `must()` helper that throws on `error`, applied to every mutation.

## P1 — why it's slow

12. **Dashboard waterfall:** `page.tsx:678-736` runs 5 fetches in 3 serial stages and shows a spinner until all finish — load time is the *sum* of the slowest routes, not the max. One-file fix: single `Promise.all`, unblock the grid on `outreach-list`.
13. **Payloads that grow forever:** `/api/queue` selects `*` (including full letter bodies) with no limit (`queue/route.ts:10-13`); `/api/followup-candidates` ships every sent letter's body ~3× when the dashboard needs two integers (`followup-candidates/route.ts:12-18, 47-62`). This is the progressive-slowdown signature.
14. **`/api/outreach-list` and `/api/open-roles-list`:** three sequential queries each (independent — should be parallel), an unfiltered full-`contacts` scan, ~60 regexes per company per request, `scoreJobForKohler` executed twice per job (`open-roles-list/route.ts:96, 189`), zero caching anywhere (all `no-store` + `force-dynamic`). Cache these responses 60s — the data changes at cron cadence, not per view.
15. **Silent 1000-row truncation:** PostgREST caps un-ranged selects; only the companies query was patched to paginate. `contacts` (788 rows and growing), `job_listings` queries, and the cron's company scan will silently truncate — the cron then re-searches companies it thinks lack contacts (duplicate contacts, wasted RocketReach credits).
16. **No indexes** on `job_listings(is_relevant, ingest_status)`, `job_listings(companyname)`, `contacts(companyname)`, `reachout_company_inserts(companyname, contactname)` — fine at hundreds of rows, real as data grows.

## P1 — split-brain data

17. **Two databases, drifting docs.** Production app → "KOHLER OS" (`acwgirrldntjpzrhqmdh`, 39+ tables shared with unrelated projects); sandbox → `nwsjgppkfducaikxsyvk`. The 5/14 incident applied a migration + 273-row backfill to production by accident. Docs claim migration 002 (`sent_messages`/`email_threads`/`email_messages`) is sandbox-only, but the live production lint shows those tables exist there now — the inventories in docs/ are stale in both directions. Regenerate them; they are the map everyone (including your other AI) navigates by.
18. **Env precedence trap:** `KOHLER_SUPABASE_URL/KEY` silently beat `SUPABASE_URL/SERVICE_ROLE_KEY` (`supabaseAdmin.ts:5-7`). Stale `KOHLER_*` values = writes to one project while you inspect the other. Pin one explicit pair; make `/api/runtime-diagnostics` assert the expected project ref.
19. **Hardcoded production URL:** `save-signature/route.ts:28` stores `https://acwgirrldntjpzrhqmdh.supabase.co/...` regardless of environment — signature updates point at the wrong project from sandbox.
20. **Dead-end table:** `/api/import-ziprecruiter` writes to `jobs`; nothing reads `jobs`. Imports "succeed" and never appear.
21. **Gmail backfill dedup mismatch:** OAuth path keys by Gmail API ids, the IMAP script by `imap:<Message-ID>`/decimal thread ids — the same email imports twice across paths; `sent_messages` channel flips letter→email double-count outbound. Pick one path before running the production backfill.

## Security

22. **Sandbox: `gmail_accounts` exposed with OAuth tokens.** RLS disabled on `gmail_accounts` (contains `access_token`/`refresh_token`), `companies`, `contacts`, `job_listings`, `tracking`, `reachout_company_inserts`, and 6 more — all readable/writable with the public anon key. Enable RLS on all of them today (service-role access is unaffected).
23. **Production: public writes allowed** to `jobs` (INSERT) and `tracking` (INSERT/UPDATE) via always-true policies — anyone with the anon key can inject rows. Drop or scope those policies.
24. **`requireCronSecret` fails open** with no `CRON_SECRET` set (`auth.ts:66-69`) — anyone can trigger the research cron; inconsistent with `requireApiSecret` (fails closed).

## Ops

25. **There is no CI.** `.github/` doesn't exist; the four test suites, `tsc`, and `verify-job-links.mjs` run only by hand. The git history is the receipt: 15 commits on 2026-04-02 alone, 12 prefixed `fix:`. Every regression ships and is found in production by you.
26. **Three schedulers, no inventory:** Vercel crons (2), a pg_cron inside production Postgres POSTing the production app daily (documented only in `docs/deploy-map.md`), and nothing scheduling ziprecruiter in this repo. Only careers writes `sync_runs` — and its `finishSyncRun` never fires on timeout, so run history shows eternal `"running"` rows. A dead schedule is currently indistinguishable from a quiet day.

## Recommended fix order

1. Reconnect Google OAuth in production (`/api/google/connect`) — restores ingest today, no code.
2. Cron dynamics + auth: `force-dynamic` on `/api/cron/research` (and `/api/template`), set `CRON_SECRET`, fail closed, accept any-of secrets in careers, alert on cron non-200.
3. Enable RLS on the exposed sandbox tables (tokens first); drop production's public-write policies.
4. Un-wedge follow-ups (accept `sent`/`emailed`; approval belongs in the followups UI) and stop the modal autosave clobbering `body_final`.
5. Make every write loud (`must()` helper); fix `/api/draft` duplicate forking.
6. Ingest reliability: fail-open URL checks (never close on error), rotate company ordering, fit batches to the time budget, advance the Gmail cursor only after processing, paginate `history.list`.
7. Dashboard speed: parallel `loadData`, drop letter bodies from load-path payloads, cache scored lists 60s, add the four indexes.
8. Add CI (tests + `tsc` + build on PR; nightly probe asserting a fresh ingest row in the last 24h) and regenerate the schema inventory docs.

## Caveat

The production repo (`STUDIOPARCELS/kohler-outreach`) has routes this sandbox lacks — `/api/cron/orchestrator`, `/api/cron/jobs`, `/api/cron/news` are the ones timing out in the logs. This review's findings apply where the code matches; the orchestrator itself needs the same review run against that repo (add it to a session's repo scope, or run Claude Code in that checkout).
