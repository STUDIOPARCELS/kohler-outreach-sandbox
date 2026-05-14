# Production Promotion Plan

> Filled in during Phase 12. Stub created in Phase 1 so each phase can list
> migrations and env vars it adds, ready for promotion.

## Promotion gates

A change is promotion-ready when:

1. It ships behind a feature flag or additive migration.
2. It has tests or verifiable smoke evidence in the sandbox.
3. It does not break any existing production route or data shape.
4. The promotion plan lists the exact env vars and migrations needed in prod.

## Migrations to apply (additive only)

| Filename | Phase | Purpose | Reversible? |
| --- | --- | --- | --- |
| _populated by Phase 3+_ | | | |

## Env vars required in production

| Env var | Required? | Default | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_ENV` | optional | inferred | Forces the env badge label. |
| `ENABLE_LIVE_SEND` | optional | `false` | Must be `true` to send emails (Phase 9). |
| `KOHLER_PORTFOLIO_URL` | optional | `https://kohler.solokit.app` | Phase 8 templates. |
| `KOHLER_RESUME_URL` | optional | unset | Public résumé link. Phase 8. |
| _(grows as phases ship)_ | | | |

## Production routes affected

(Filled in per phase.)

## Rollback path

Each migration is additive (new tables + new columns with defaults). Rollback
is "stop reading the new columns" — no destructive change is needed.

For Gmail send specifically, rollback is `ENABLE_LIVE_SEND=false`.

## Smoke test checklist

- [ ] `/api/health` returns 200.
- [ ] `/api/runtime-diagnostics` reports the correct environment.
- [ ] `/open-roles` renders with current ingest data.
- [ ] `/queue` shows existing letter drafts.
- [ ] `/api/ingest/careers` runs successfully on cron schedule.
- [ ] `/api/ingest/ziprecruiter` is reachable from `pg_cron` (production only).

## Data validation queries

```sql
-- Sanity check job counts before/after promotion
select count(*) from job_listings;
select count(*) from job_listings where is_relevant = true;
select count(*) from job_ingest_runs where status = 'completed';
```

## Production-only features to preserve

- `pg_cron` schedule against `/api/ingest/ziprecruiter` (do NOT migrate to
  Vercel cron in production — sandbox uses Vercel cron only).
- Production `kohler-outreach.vercel.app` domain.
- Production `GOOGLE_REDIRECT_URI` value.
- Production hostnames in OG / Twitter card metadata.

## Recommended release order

1. Provenance migration (additive).
2. Adapter scaffolding.
3. Fit-score migration.
4. Contact-enrichment migration.
5. Outreach-workflow migration.
6. Gmail draft + ENABLE_LIVE_SEND gate.
7. Email-thread / message migration.
8. Dashboard route.
