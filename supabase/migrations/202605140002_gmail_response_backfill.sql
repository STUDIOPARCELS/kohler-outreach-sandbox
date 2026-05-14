-- Gmail response analytics spine for sandbox backfill.
-- Additive only: preserves legacy outreach and tracking tables.

create table if not exists public.sent_messages (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid references public.reachout_company_inserts(id) on delete set null,
  source_table text not null default 'reachout_company_inserts',
  source_id text not null,
  channel text not null default 'email' check (channel in ('email', 'letter', 'unknown')),
  companyname text,
  contact_email text,
  subject text,
  status text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sent_messages_source_channel_uidx
  on public.sent_messages (source_table, source_id, channel);

create index if not exists sent_messages_contact_email_idx
  on public.sent_messages (contact_email);

create index if not exists sent_messages_sent_at_idx
  on public.sent_messages (sent_at desc);

create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  gmail_thread_id text not null unique,
  companyname text,
  contact_email text,
  outreach_id uuid references public.reachout_company_inserts(id) on delete set null,
  matched_by text,
  first_message_at timestamptz,
  last_message_at timestamptz,
  classification text not null default 'unknown',
  needs_follow_up boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_threads_contact_email_idx
  on public.email_threads (contact_email);

create index if not exists email_threads_classification_idx
  on public.email_threads (classification);

create index if not exists email_threads_last_message_at_idx
  on public.email_threads (last_message_at desc);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  email_thread_id uuid references public.email_threads(id) on delete cascade,
  gmail_thread_id text not null,
  gmail_message_id text not null unique,
  direction text not null default 'incoming' check (direction in ('incoming', 'outgoing', 'unknown')),
  from_email text,
  to_emails text[] not null default '{}'::text[],
  subject text,
  snippet text,
  received_at timestamptz,
  sent_at timestamptz,
  internal_date_ms bigint,
  label_ids text[] not null default '{}'::text[],
  classification text not null default 'unknown',
  is_auto_reply boolean not null default false,
  raw_headers jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_messages_thread_idx
  on public.email_messages (gmail_thread_id);

create index if not exists email_messages_from_email_idx
  on public.email_messages (from_email);

create index if not exists email_messages_received_at_idx
  on public.email_messages (received_at desc);

create index if not exists email_messages_classification_idx
  on public.email_messages (classification);

alter table public.sent_messages enable row level security;
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;
