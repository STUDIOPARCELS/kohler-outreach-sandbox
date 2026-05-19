# Denver Data-Center Contact Targeting — Import

Two related workbook imports for the Denver / AI-infrastructure data-center
buildout, both loaded into the **KOHLER OS** Supabase project
(`acwgirrldntjpzrhqmdh`) — the database the deployed sandbox app
(`kohler-outreach-sandbox-zxvm.vercel.app`) reads. Production
(`kohler-outreach.vercel.app`) also reads this database, so the data is
visible on both sites.

All imported rows share `niche = 'Data Center Buildout'` so they are
filterable as a single set, and every row carries a `[Denver DC Targeting]`
or `[75-Companies enrichment]` tag in `notes` for traceability / cleanup.

## What was loaded

### Workbook 1: `0231594b-denver_data_center_contact_targeting.xlsx`
Seed SQL: [`supabase/seed/denver_dc_targeting.sql`](../supabase/seed/denver_dc_targeting.sql)

| | Count |
| --- | --- |
| Contacts (named individuals) | **90** |
| Companies referenced | 26 |
| Contacts with a LinkedIn profile URL | 53 |
| Contacts with an email | **0 — see Enrichment below** |

The "Contact Targets" sheet has 200 rows. Only the 90 named individuals
were loaded. Excluded: 75 `[Find named person]` placeholders, 34
team/inbox/hiring-lane rows (e.g. "DPR Mission Critical team"), and 1
partial name (CT-112).

3 of the 90 (Gary Orazio, Tim Chiddix, Rachel Barrett at Swanson Rink)
already existed in the DB and were tagged rather than duplicated.

### Workbook 2: `e93482e5-denver_data_center_75_companies_simplified.xlsx`
Seed SQL: [`supabase/seed/denver_dc_75_companies.sql`](../supabase/seed/denver_dc_75_companies.sql)

| | Count |
| --- | --- |
| Companies in the workbook | **75** |
| New inserts into KOHLER OS | 41 |
| Existing companies re-niched to `Data Center Buildout` (prior niche preserved in notes) | 8 |
| Existing `Data Center Buildout` companies enriched with address / about / careers URL | 26 |
| Final count of `niche = 'Data Center Buildout'` companies in KOHLER OS | **75** |

Each company gets: `mailing_address1` / `mailing_city` / `mailing_state` /
`mailing_zip` (parsed from the workbook address when feasible), `company_about`
(the "what they actually do" column), `careers_url`, and a `notes` block
with drive time from 80226, employee count, and category.

## Field mapping

- `contacts.contactname` / `title` / `linkedin` ← workbook name, title,
  and Public Source URL (only when it is a `linkedin.com/in/` profile).
- `contacts.email` ← left **NULL**; `email_searched` ← **false**.
- `contacts.notes` ← workbook targeting metadata, prefixed
  `[Denver DC Targeting CT-xxx]`.
- `companies.niche` ← `'Data Center Buildout'` for all 75.
- `companies.notes` ← `[Denver DC Targeting]` block and/or
  `[75-Companies enrichment]` block; `[Prior niche: X]` appended where
  an earlier niche was replaced.
- `companies.company_about` ← the workbook's "What they actually do".
- `companies.mailing_*` ← parsed from the workbook address.

Easy queries:

```sql
-- All 75 Data Center Buildout companies
select companyname, mailing_city, careers_url from companies
 where niche = 'Data Center Buildout' order by companyname;

-- All 90 targeting contacts
select companyname, contactname, title, linkedin from contacts
 where notes like '%Denver DC Targeting%' order by companyname;
```

## Enrichment — attaching real emails

The workbook contains **no email addresses**. All 90 contacts are queued
for enrichment (`email = NULL`, `email_searched = false`). Enrichment
runs through the app's RocketReach route — it cannot be run from this
Claude Code session because that environment has no outbound network and
no RocketReach key.

Route: `POST /api/backfill-emails` (`src/app/api/backfill-emails/route.ts`)

- Auth: header `X-API-SECRET: <API_SECRET>`.
- Body: `{ "limit": 20 }` (default 20, max 50). It selects contacts
  whose email is null/empty, looks each up via RocketReach, and writes
  `email` (plus `linkedin`/`phone` when found).
- It processes ~20 per call with a 2s delay each, so **call it ~5 times**
  to cover all 90.

```bash
curl -X POST https://kohler-outreach-sandbox-zxvm.vercel.app/api/backfill-emails \
  -H "X-API-SECRET: $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'
```

Because the deployed sandbox reads KOHLER OS, this enriches the same rows
that production reads — there is no separate sandbox database to wire up.

## Where to see it in the app

Live at **<https://kohler-outreach-sandbox-zxvm.vercel.app/>** (and at
`https://kohler-outreach.vercel.app/` since both read KOHLER OS):

- `/outreach-list` — filter the niche dropdown to `Data Center Buildout`
  to see all 75 companies grouped together.
- `/company/<name>` — per-company detail with the new address, careers
  URL, "about", and the imported contacts.
- `/queue` — once enrichment fills emails, draft outreach as usual.
