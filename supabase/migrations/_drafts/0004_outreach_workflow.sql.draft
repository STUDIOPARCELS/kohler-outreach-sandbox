-- Phase 8 — outreach workflow tables (additive only).
--
-- Existing reachout_company_inserts is left untouched and remains
-- authoritative for the legacy letter flow. The new tables sit alongside
-- it and become the source of truth for the new outreach engine. Phase 9
-- (Gmail) and Phase 10 (metrics) read from these tables.

create table if not exists public.outreach_campaigns (
  id              bigserial primary key,
  name            text not null,
  channel         text not null default 'email',  -- email | letter | linkedin | mixed
  status          text not null default 'active', -- active | paused | done
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.outreach_actions (
  id                  bigserial primary key,
  campaign_id         bigint references public.outreach_campaigns(id) on delete set null,
  company_id          bigint,
  companyname         text,
  contact_id          bigint,
  job_id              bigint references public.job_listings(id) on delete set null,
  template_key        text not null,
  recommended_action  text,
  status              text not null default 'queued',
    -- queued | drafted | human_approved | sent | replied | bounced | abandoned
  channel             text not null default 'email',
  scheduled_for       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists outreach_actions_status_idx
  on public.outreach_actions (status);
create index if not exists outreach_actions_company_idx
  on public.outreach_actions (companyname);
create index if not exists outreach_actions_job_idx
  on public.outreach_actions (job_id);

create table if not exists public.email_drafts (
  id                  bigserial primary key,
  outreach_action_id  bigint references public.outreach_actions(id) on delete cascade,
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
    -- draft | human_approved | gmail_drafted | sent | failed
  gmail_draft_id      text,
  gmail_message_id    text,
  gmail_thread_id     text,
  approved_by         text,
  approved_at         timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists email_drafts_status_idx
  on public.email_drafts (status);
create index if not exists email_drafts_action_idx
  on public.email_drafts (outreach_action_id);
create index if not exists email_drafts_thread_idx
  on public.email_drafts (gmail_thread_id);

create table if not exists public.letters (
  id                  bigserial primary key,
  outreach_action_id  bigint references public.outreach_actions(id) on delete cascade,
  to_name             text,
  to_address          text,
  body_text           text not null,
  status              text not null default 'draft',
    -- draft | printed | mailed | returned
  printed_at          timestamptz,
  mailed_at           timestamptz,
  created_at          timestamptz not null default now()
);

create table if not exists public.applications (
  id                  bigserial primary key,
  job_id              bigint references public.job_listings(id) on delete set null,
  outreach_action_id  bigint references public.outreach_actions(id) on delete set null,
  companyname         text not null,
  applied_via         text not null default 'web', -- web | recruiter | referral | letter
  apply_url           text,
  notes               text,
  applied_at          timestamptz not null default now(),
  status              text not null default 'submitted',
    -- submitted | screening | interview | offer | rejection | withdrawn
  result_at           timestamptz
);

create index if not exists applications_company_idx
  on public.applications (companyname);
create index if not exists applications_status_idx
  on public.applications (status);
