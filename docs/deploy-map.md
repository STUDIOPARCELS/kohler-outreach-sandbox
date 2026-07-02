# Kohler Outreach Engine — Ingest Operations

## Scheduler

- **Engine:** Supabase pg_cron (runs inside Postgres, not Vercel cron)
- **Schedule:** `0 14 * * *` UTC = 8:00 AM MDT / 7:00 AM MST
- **Target:** `https://kohler-outreach.vercel.app/api/ingest/ziprecruiter`
- **Auth:** `x-import-secret` header (value in Supabase `cron.job.command`)
- **DST drift:** 1 hour (7 AM vs 8 AM) — accepted as operationally insignificant
- **Vercel cron (`vercel.json`):** declares two crons — `/api/cron/research` (daily `0 8 * * *`) and `/api/ingest/careers` (Tue/Fri `15 14 * * 2,5`); the ziprecruiter email ingest is pg_cron only

## Sandbox Career-Page Ingest

- **Engine:** Vercel cron on the sandbox deployment
- **Schedule:** `15 14 * * 2,5` UTC = Tuesday/Friday Denver morning with DST drift
- **Target:** `https://kohler-outreach-sandbox.vercel.app/api/ingest/careers`
- **Auth:** Vercel `CRON_SECRET` authorization header, accepted by the route as `Authorization: Bearer <secret>`
- **Coverage:** company rows with `careers_url` in the target niches, plus Built In Colorado, GovernmentJobs direct, and optional USAJOBS
- **No per-search fee:** direct company career pages/ATS, Built In, and GovernmentJobs direct are HTTP fetches; expected cost is normal Vercel function runtime plus Supabase usage
- **USAJOBS:** optional; missing USAJOBS env vars produce a warning and do not block the run

To inspect:
```sql
SELECT jobid, schedule, active, substring(command from '''(https://[^'']+)''') as target
FROM cron.job WHERE jobid = 1;

SELECT status, start_time, end_time FROM cron.job_run_details
WHERE jobid = 1 ORDER BY start_time DESC LIMIT 5;
```

## Gmail Message Selection

The ingest route uses **sender-domain matching exclusively**.

```
from:(ziprecruiter.com OR governmentjobs.com)
```

This covers:
- `alerts@ziprecruiter.com` (daily multi-job emails)
- `phil@ziprecruiter.com` (single-job recommendations)
- `noreply@governmentjobs.com` (job interest card alerts — staged)

The `job-ingest` Gmail label exists as inbox organization only.
The `label_id` field in `gmail_accounts` is stored but **not used for message selection**.
The pipeline works regardless of whether the label has messages.

History sync uses `users.history.list(startHistoryId=...)`.
If Gmail returns 404 (expired cursor), `last_history_id` is set to null, triggering a full-sync.

## Replay Procedure

To replay a specific email through the parser:

```bash
# DryRun (parse only, no writes)
curl -X POST https://kohler-outreach.vercel.app/api/ingest/ziprecruiter \
  -H "x-cron-secret: <secret>" \
  -H "Content-Type: application/json" \
  -d '{"messageId": "<FULL_GMAIL_MESSAGE_ID>", "dryRun": true}'

# Wet replay (parse + write to DB)
curl -X POST https://kohler-outreach.vercel.app/api/ingest/ziprecruiter \
  -H "x-cron-secret: <secret>" \
  -H "Content-Type: application/json" \
  -d '{"messageId": "<FULL_GMAIL_MESSAGE_ID>"}'
```

Rules:
- Message IDs must be **exact full Gmail IDs** (e.g. `19d45105ea4cc248`)
- Truncated IDs return 400
- DryRun returns parsed jobs with relevance scores without writing
- Wet replay uses dedupe key (`external_job_key`) — safe to re-run

## Source Accounting

| Source | Type | Status |
|---|---|---|
| `ziprecruiter_email` | Automated (v5 body parser) | **Operational** |
| `governmentjobs_email` | Automated (parser staged) | **Capture-ready** |
| `manual_seed` | Hand-entered rows | 5 CDOT departments |
| `dice.com` | Manual import | 15 rows |
| `blueorigin.com` | Manual import | 5 rows |
| `usajobs` | Manual entry | 1 FAA listing |
| `ball.com` | Manual import | 1 row |

## Relevance Gate

Parser v5 scores every parsed job for Kohler's ME/EIT profile:
- **Boost:** mechanical engineer (+25-30), EIT (+35), design engineer (+22), Colorado (+15)
- **Penalty:** senior (-15), lead/principal (-20), management (-25), out-of-state (-10)
- **Threshold:** `is_relevant = true` when `match_score >= 15`
- Open Roles API filters `is_relevant = true` for outreach feed
- All rows kept in `job_listings` for audit/debug
