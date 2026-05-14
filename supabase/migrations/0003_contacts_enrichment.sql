-- Phase 7 — additive enrichment columns on contacts.
--
-- Existing `contacts` rows keep working; new fields capture role type,
-- seniority, Mines + PE signals, and a structured email confidence so
-- downstream templates can pick the best person to contact.

alter table public.contacts
  add column if not exists role_type text,
  add column if not exists seniority text,
  add column if not exists department text,
  add column if not exists is_mines_alumni boolean not null default false,
  add column if not exists is_possible_pe boolean not null default false,
  add column if not exists email_confidence text,
  add column if not exists linkedin_url text,
  add column if not exists provider_person_id text,
  add column if not exists provider_source text,
  add column if not exists verified_at timestamptz,
  add column if not exists last_enriched_at timestamptz;

create index if not exists contacts_companyname_idx
  on public.contacts (companyname);
create index if not exists contacts_role_type_idx
  on public.contacts (role_type);
create index if not exists contacts_is_mines_alumni_idx
  on public.contacts (is_mines_alumni);
create index if not exists contacts_is_possible_pe_idx
  on public.contacts (is_possible_pe);
