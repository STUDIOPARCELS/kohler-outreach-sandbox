-- Kohler Outreach Engine additive job-intelligence spine.
-- This migration intentionally avoids modifying existing legacy tables.

create extension if not exists pgcrypto;

create table if not exists public.job_sources (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  companyname text not null,
  source_type text not null,
  provider text,
  source_url text,
  external_source_id text,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  last_sync_run_id uuid,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists job_sources_identity_idx
  on public.job_sources (
    companyname,
    source_type,
    coalesce(provider, ''),
    coalesce(source_url, ''),
    coalesce(external_source_id, '')
  );

create index if not exists job_sources_companyname_idx
  on public.job_sources (companyname);

create index if not exists job_sources_enabled_idx
  on public.job_sources (enabled, source_type);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  job_source_id uuid references public.job_sources(id) on delete set null,
  provider text not null,
  source_type text not null,
  companyname text,
  status text not null default 'running'
    check (status in ('running', 'completed', 'completed_with_errors', 'error', 'skipped')),
  trigger_type text,
  dry_run boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  companies_checked integer not null default 0,
  jobs_found integer not null default 0,
  jobs_relevant integer not null default 0,
  jobs_inserted integer not null default 0,
  jobs_updated integer not null default 0,
  jobs_skipped integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sync_runs_provider_started_idx
  on public.sync_runs (provider, started_at desc);

create index if not exists sync_runs_status_idx
  on public.sync_runs (status, started_at desc);

create table if not exists public.role_fit_scores (
  id uuid primary key default gen_random_uuid(),
  job_listing_id text not null,
  companyname text,
  source text,
  external_job_key text,
  score_version text not null default 'kohler-fit-v1',
  skill_fit_score integer not null default 0,
  entry_level_score integer not null default 0,
  pe_track_score integer not null default 0,
  niche_score integer not null default 0,
  location_score integer not null default 0,
  mines_signal_score integer not null default 0,
  overall_score integer not null default 0,
  recommended_action text not null default 'monitor'
    check (recommended_action in (
      'apply_now',
      'email_engineering_manager',
      'email_recruiter',
      'alumni_outreach',
      'pe_track_outreach',
      'physical_letter',
      'monitor',
      'skip'
    )),
  explanation_summary text,
  explanation_json jsonb not null default '{}'::jsonb,
  scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists role_fit_scores_job_version_idx
  on public.role_fit_scores (job_listing_id, score_version);

create index if not exists role_fit_scores_company_score_idx
  on public.role_fit_scores (companyname, overall_score desc);

create index if not exists role_fit_scores_action_idx
  on public.role_fit_scores (recommended_action, overall_score desc);

create table if not exists public.outreach_actions (
  id uuid primary key default gen_random_uuid(),
  companyname text not null,
  job_listing_id text,
  contact_id text,
  campaign_id text,
  action_type text not null
    check (action_type in (
      'apply_now',
      'email_engineering_manager',
      'email_recruiter',
      'alumni_outreach',
      'pe_track_outreach',
      'physical_letter',
      'find_contacts',
      'create_draft',
      'mark_applied',
      'follow_up',
      'monitor',
      'skip'
    )),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'skipped', 'canceled')),
  priority integer not null default 0,
  due_at timestamptz,
  completed_at timestamptz,
  source text,
  title text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_sources enable row level security;
alter table public.sync_runs enable row level security;
alter table public.role_fit_scores enable row level security;
alter table public.outreach_actions enable row level security;

create index if not exists outreach_actions_status_due_idx
  on public.outreach_actions (status, due_at nulls last);

create index if not exists outreach_actions_company_idx
  on public.outreach_actions (companyname, created_at desc);

create index if not exists outreach_actions_job_idx
  on public.outreach_actions (job_listing_id);
