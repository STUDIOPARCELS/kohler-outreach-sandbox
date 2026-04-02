# Kohler Outreach Engine — Deploy Map

> Single source of truth for project IDs, repos, domains, crons, and env vars.

## Repositories

| Repo | Purpose | Branch |
|------|---------|--------|
| `STUDIOPARCELS/kohler-outreach` | Production | `main` |
| `STUDIOPARCELS/kohler-outreach-sandbox` | Sandbox (deploy here first) | `main` |

## Vercel Projects

| Project | ID | Domain |
|---------|----|--------|
| Production | `prj_cCuqH80JpIo67ooHZAVx4zL0auyf` | kohler-outreach.vercel.app |
| Sandbox | `prj_0jkVUegt9SPsGCrxOub8ANPV4TQj` | kohler-outreach-sandbox.vercel.app |
| Team | `team_gdYLn40FUPUZaHBC5Km35eIT` | — |

## Supabase

| Field | Value |
|-------|-------|
| Project ID | `acwgirrldntjpzrhqmdh` |
| URL | `https://acwgirrldntjpzrhqmdh.supabase.co` |
| Source of truth for jobs | `job_listings` table |
| Unique constraint | `(source, external_job_key)` |
| Job view | `relevant_roles` SQL VIEW over `job_listings` |

## Cron Endpoints

| Endpoint | Schedule | Trigger |
|----------|----------|---------|
| `/api/ingest/ziprecruiter` | `0 14 * * *` (8am MT) | pg_cron + pg_net HTTP POST |
| `/api/cron/research` | `0 8 * * *` | Vercel cron (vercel.json) |

### Ingest route modes

```
# Normal cron (daily)
POST /api/ingest/ziprecruiter
Header: x-cron-secret: <INGEST_SECRET>

# Replay a specific Gmail message (re-processes, skips dedupe)
POST /api/ingest/ziprecruiter
Header: x-cron-secret: <INGEST_SECRET>
Body: { "messageId": "<gmail_message_id>" }

# Dry run (parse only, no DB writes)
POST /api/ingest/ziprecruiter
Header: x-cron-secret: <INGEST_SECRET>
Body: { "messageId": "<gmail_message_id>", "dryRun": true }
```

## Environment Variables (both projects)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin access |
| `KOHLER_SUPABASE_URL` | Alias |
| `KOHLER_SUPABASE_KEY` | Alias |
| `GOOGLE_CLIENT_ID` | Gmail OAuth |
| `GOOGLE_CLIENT_SECRET` | Gmail OAuth |
| `GOOGLE_REDIRECT_URI` | Gmail OAuth callback (per project) |
| `INGEST_SECRET` | Cron auth |
| `IMPORT_SECRET` | Cron auth (alias) |
| `CRON_SECRET` | Vercel cron auth |
| `API_SECRET` | General API auth |
| `ROCKETREACH_API_KEY` | Contact lookup |
| `OPENAI_API_KEY` | Job search fallback |
| `ANTHROPIC_API_KEY` | AI features |
| `GOOGLE_PLACES_API_KEY` | Address lookup |
| `GMAIL_USER` | Email sending |
| `GMAIL_APP_PASSWORD` | Email sending |
| `REPLY_TO_EMAIL` | Email reply-to |

## Git Config

| Field | Value |
|-------|-------|
| Email | `317lrw@gmail.com` |
| Name | `Lisa Wood` |
| PAT | `<GITHUB_PAT>` |

> Vercel rejects commits from other emails.

## Ingest Sources

| Source value | Parser | From address |
|-------------|--------|-------------|
| `ziprecruiter_email` | `parseZipRecruiterEmail()` | `alerts@ziprecruiter.com` |
| `governmentjobs_email` | `parseGovernmentJobsEmail()` | `noreply@governmentjobs.com` |
| `governmentjobs` | Manual entry | — |
| `dice.com` | Manual entry | — |
| `blueorigin.com` | Manual entry | — |
| `ball.com` | Manual entry | — |

## Workflow Rule

**Sandbox first. Always.**

1. Push to `kohler-outreach-sandbox`
2. Deploy to `prj_0jkVUegt9SPsGCrxOub8ANPV4TQj`
3. Verify on kohler-outreach-sandbox.vercel.app
4. Lisa approves
5. Push to `kohler-outreach` (production)
6. Deploy to `prj_cCuqH80JpIo67ooHZAVx4zL0auyf`
