-- Hot-path indexes for the dashboard list routes
-- (docs/CODE_REVIEW_2026-07-02.md item 16). Additive only; safe to re-run.
--
-- /api/outreach-list and /api/open-roles-list filter job_listings on
-- (is_relevant, ingest_status) and group by companyname; contact lookups and
-- letter lookups key on companyname (+ contactname); /api/followup-candidates
-- scans reachout_company_inserts by sent_at.

create index if not exists job_listings_relevant_status_idx
  on public.job_listings (is_relevant, ingest_status);

create index if not exists job_listings_companyname_idx
  on public.job_listings (companyname);

create index if not exists contacts_companyname_idx
  on public.contacts (companyname);

create index if not exists reachout_company_inserts_company_contact_idx
  on public.reachout_company_inserts (companyname, contactname);

create index if not exists reachout_company_inserts_sent_at_idx
  on public.reachout_company_inserts (sent_at);
