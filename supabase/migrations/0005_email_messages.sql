-- Phase 9 — Gmail send/draft + reply tracking (additive only).
--
-- Three new tables capture: an outbound message we sent or drafted,
-- a Gmail thread we are tracking, and the individual messages on each
-- tracked thread (both ours and replies).

create table if not exists public.sent_messages (
  id                  bigserial primary key,
  email_draft_id      bigint references public.email_drafts(id) on delete set null,
  outreach_action_id  bigint references public.outreach_actions(id) on delete set null,
  to_email            text,
  to_name             text,
  subject             text,
  body_text           text,
  gmail_message_id    text,
  gmail_thread_id     text,
  channel             text not null default 'email',
  delivery_mode       text not null default 'gmail_draft', -- gmail_draft | gmail_send | smtp_send | dry_run
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists sent_messages_thread_idx
  on public.sent_messages (gmail_thread_id);
create index if not exists sent_messages_action_idx
  on public.sent_messages (outreach_action_id);

create table if not exists public.email_threads (
  id                  bigserial primary key,
  gmail_thread_id     text unique,
  contact_id          bigint,
  contact_email       text,
  companyname         text,
  outreach_action_id  bigint references public.outreach_actions(id) on delete set null,
  job_id              bigint references public.job_listings(id) on delete set null,
  first_seen_at       timestamptz not null default now(),
  last_message_at     timestamptz,
  last_classification text,
  needs_action        boolean not null default false
);

create index if not exists email_threads_contact_idx
  on public.email_threads (contact_email);
create index if not exists email_threads_company_idx
  on public.email_threads (companyname);
create index if not exists email_threads_needs_action_idx
  on public.email_threads (needs_action);

create table if not exists public.email_messages (
  id                  bigserial primary key,
  email_thread_id     bigint references public.email_threads(id) on delete cascade,
  gmail_message_id    text unique,
  gmail_thread_id     text,
  direction           text not null default 'inbound', -- inbound | outbound
  from_email          text,
  from_name           text,
  to_emails           text[],
  subject             text,
  snippet             text,
  body_text           text,
  internal_date       timestamptz,
  classification      text,
  classification_confidence numeric,
  raw_payload         jsonb,
  fetched_at          timestamptz not null default now()
);

create index if not exists email_messages_thread_id_idx
  on public.email_messages (email_thread_id);
create index if not exists email_messages_classification_idx
  on public.email_messages (classification);
create index if not exists email_messages_direction_idx
  on public.email_messages (direction);
