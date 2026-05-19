# Denver Data-Center Contact Targeting — Import

Import of the Denver / AI-infrastructure contact-targeting workbook
(`0231594b-denver_data_center_contact_targeting.xlsx`) into the
**Kohler Outreach Sandbox** Supabase project (`nwsjgppkfducaikxsyvk`).

Seed SQL: [`supabase/seed/denver_dc_targeting.sql`](../supabase/seed/denver_dc_targeting.sql)
(idempotent — safe to re-run).

## What was loaded

| | Count |
| --- | --- |
| Contacts (named individuals) | 90 |
| Companies | 26 referenced — 19 newly inserted, 7 already existed |
| Contacts with a LinkedIn profile URL | 55 |
| Contacts with an email | **0 — see Enrichment below** |

The workbook's "Contact Targets" sheet has 200 rows. Only the **90 named
individuals** were loaded. Deliberately excluded:

- **75** `[Find named person]` placeholder rows ("Role-based target to
  identify") — not real people.
- **34** team / inbox / hiring-lane rows (e.g. "DPR Mission Critical team",
  `careers@rmhgroup.com`) — not individuals.
- **1** partial name (CT-112, "Mike [Colorado Controls Construction
  leader]").

3 of the 90 (Gary Orazio, Tim Chiddix, Rachel Barrett at Swanson Rink)
already existed in the DB; those rows were kept and tagged rather than
duplicated.

## Field mapping

- `contacts.contactname` / `title` / `linkedin` ← workbook name, title,
  and Public Source URL (only when it is a `linkedin.com/in/` profile).
- `contacts.email` ← left **NULL**; `email_searched` ← **false**.
- `contacts.notes` ← workbook targeting metadata (priority, outreach
  score, target lane, why-this-target, best ask, role keywords, source
  links), prefixed `[Denver DC Targeting CT-xxx]`.
- `companies.niche` / `careers_url` ← workbook category and careers URL;
  `companies.notes` prefixed `[Denver DC Targeting]`.

Every imported row carries the literal tag `Denver DC Targeting` in
`notes`, so the set is easy to query or remove:

```sql
select * from contacts  where notes like '%Denver DC Targeting%';
select * from companies where notes like '%Denver DC Targeting%';
```

## Enrichment — attaching real emails

The workbook contains **no email addresses**. All 90 contacts are queued
for enrichment (`email = NULL`). Enrichment runs through the app's
RocketReach route — it cannot be run from a Claude Code session because
that environment has no outbound network and no RocketReach key.

Route: `POST /api/backfill-emails` (`src/app/api/backfill-emails/route.ts`)

- Auth: header `X-API-SECRET: <API_SECRET>`.
- Body: `{ "limit": 20 }` (default 20, max 50). It selects contacts whose
  email is null/empty, looks each up via RocketReach, and writes
  `email` (plus `linkedin`/`phone` when found).
- It processes ~20 per call with a 2s delay each, so **call it ~5 times**
  to cover all 90 (it also picks up any other email-less contacts in the
  same database).

Example:

```bash
curl -X POST https://<sandbox-app-host>/api/backfill-emails \
  -H "X-API-SECRET: $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'
```

### Prerequisite — database wiring

`/api/backfill-emails` enriches whichever database the deployed app is
connected to (`KOHLER_SUPABASE_URL` / `KOHLER_SUPABASE_KEY`). For it to
enrich these rows, the deployed sandbox app must point at the **Kohler
Outreach Sandbox** project (`nwsjgppkfducaikxsyvk`). If it currently
points at the shared KOHLER OS project, update the sandbox deployment's
env vars first — otherwise the lookups will run against the wrong data.

## Where to see it in the app

Once the app is pointed at this database, the imported records appear in
the existing UI: companies on `/outreach-list` and their contacts on the
`/company/[companyname]` detail pages.
