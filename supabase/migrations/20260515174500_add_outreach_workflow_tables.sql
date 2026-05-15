-- Session E — Phase 8 outreach workflow tables (additive only).
-- Applied to KOHLER OS (acwgirrldntjpzrhqmdh) 2026-05-15 via apply_migration.
-- Reconciled from _drafts/0004: outreach_actions ALREADY EXISTS in
-- production with a different schema and is NOT recreated here. These
-- four tables are genuinely new. All PKs uuid; FK types match live
-- tables (outreach_actions.id uuid, job_listings.id int4).

create table if not exists public.outreach_campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  channel     text not null default 'email',
  status      text not null default 'active',
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.email_drafts (
  id                  uuid primary key default gen_random_uuid(),
  outreach_action_id  uuid references public.outreach_actions(id) on delete cascade,
  to_email            text,
  to_name             text,
  cc_email            text,
  bcc_email           text,
  reply_to            text,
  subject             text not null,
  body_html           text,
  body_text           text,
  template_key        text,
  variables           jsonb not null default '{}'::jsonb,
  status              text not null default 'draft',
  gmail_draft_id      text,
  gmail_message_id    text,
  gmail_thread_id     text,
  approved_by         text,
  approved_at         timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists email_drafts_status_idx on public.email_drafts (status);
create index if not exists email_drafts_action_idx on public.email_drafts (outreach_action_id);
create index if not exists email_drafts_thread_idx on public.email_drafts (gmail_thread_id);

create table if not exists public.letters (
  id                  uuid primary key default gen_random_uuid(),
  outreach_action_id  uuid references public.outreach_actions(id) on delete cascade,
  to_name             text,
  to_address          text,
  body_text           text not null,
  status              text not null default 'draft',
  printed_at          timestamptz,
  mailed_at           timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists letters_status_idx on public.letters (status);
create index if not exists letters_action_idx on public.letters (outreach_action_id);

create table if not exists public.applications (
  id                  uuid primary key default gen_random_uuid(),
  job_listing_id      integer references public.job_listings(id) on delete set null,
  outreach_action_id  uuid references public.outreach_actions(id) on delete set null,
  companyname         text not null,
  applied_via         text not null default 'web',
  apply_url           text,
  notes               text,
  applied_at          timestamptz not null default now(),
  status              text not null default 'submitted',
  result_at           timestamptz
);

create index if not exists applications_company_idx on public.applications (companyname);
create index if not exists applications_status_idx on public.applications (status);
create index if not exists applications_job_idx on public.applications (job_listing_id);
