-- Session F — Gmail reply ingestion tables (additive only).
-- Applied to KOHLER OS (acwgirrldntjpzrhqmdh) 2026-05-14 via apply_migration.
-- Reconciled from _drafts/0005_email_messages.sql.draft against live schema:
--   all PKs uuid; outreach_action_id → outreach_actions.id (uuid);
--   contact_id → contacts.id (int4); job_listing_id → job_listings.id (int4);
--   email_draft_id left as nullable uuid with no FK (Session E adds it).

create table if not exists public.sent_messages (
  id                  uuid primary key default gen_random_uuid(),
  email_draft_id      uuid,
  outreach_action_id  uuid references public.outreach_actions(id) on delete set null,
  to_email            text,
  to_name             text,
  subject             text,
  body_text           text,
  gmail_message_id    text,
  gmail_thread_id     text,
  channel             text not null default 'email',
  delivery_mode       text not null default 'gmail_draft',
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists sent_messages_thread_idx on public.sent_messages (gmail_thread_id);
create index if not exists sent_messages_action_idx on public.sent_messages (outreach_action_id);
create index if not exists sent_messages_sent_at_idx on public.sent_messages (sent_at desc nulls last);

create table if not exists public.email_threads (
  id                  uuid primary key default gen_random_uuid(),
  gmail_thread_id     text unique,
  contact_id          integer references public.contacts(id) on delete set null,
  contact_email       text,
  companyname         text,
  outreach_action_id  uuid references public.outreach_actions(id) on delete set null,
  job_listing_id      integer references public.job_listings(id) on delete set null,
  first_seen_at       timestamptz not null default now(),
  last_message_at     timestamptz,
  last_classification text,
  needs_action        boolean not null default false
);

create index if not exists email_threads_contact_email_idx on public.email_threads (contact_email);
create index if not exists email_threads_company_idx on public.email_threads (companyname);
create index if not exists email_threads_needs_action_idx on public.email_threads (needs_action);
create index if not exists email_threads_last_message_idx on public.email_threads (last_message_at desc nulls last);

create table if not exists public.email_messages (
  id                  uuid primary key default gen_random_uuid(),
  email_thread_id     uuid references public.email_threads(id) on delete cascade,
  gmail_message_id    text unique,
  gmail_thread_id     text,
  direction           text not null default 'inbound',
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

create index if not exists email_messages_thread_id_idx on public.email_messages (email_thread_id);
create index if not exists email_messages_classification_idx on public.email_messages (classification);
create index if not exists email_messages_direction_idx on public.email_messages (direction);
create index if not exists email_messages_internal_date_idx on public.email_messages (internal_date desc nulls last);
create index if not exists email_messages_inbound_action_idx
  on public.email_messages (classification, internal_date desc)
  where direction = 'inbound';
