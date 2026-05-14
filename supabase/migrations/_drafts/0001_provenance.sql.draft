-- Phase 3 — Job-source provenance (additive only).
--
-- Safe to apply in any environment that already has `job_listings` and
-- `job_ingest_runs`. Uses IF NOT EXISTS everywhere so re-runs are no-ops.
--
-- New tables
--   job_sources   — registry of configured ingest sources
--   sync_runs     — generic per-run record (supersedes job_ingest_runs in
--                   downstream code, but job_ingest_runs is preserved for
--                   the existing ZipRecruiter ingest route)
--
-- New columns on job_listings (additive only — no drops, no renames)
--   source_url       — original posting URL kept distinct from job_url
--   apply_url        — explicit apply link (often the same as job_url today)
--   normalized_hash  — stable hash of the normalized job content
--   closed_at        — timestamp when ingest_status flipped to "closed"

----------------------------------------------------------------------
-- job_sources
----------------------------------------------------------------------
create table if not exists public.job_sources (
  id              bigserial primary key,
  source_type     text not null unique,
  display_name    text not null,
  category        text not null default 'other',
  enabled         boolean not null default true,
  base_url        text,
  config          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists job_sources_category_idx
  on public.job_sources (category);
create index if not exists job_sources_enabled_idx
  on public.job_sources (enabled);

-- Seed the registry with the source_type values already in use. ON CONFLICT
-- DO NOTHING means re-running this migration leaves curated rows alone.
insert into public.job_sources (source_type, display_name, category, base_url) values
  ('ziprecruiter_email',    'ZipRecruiter (email)',        'email',    'https://www.ziprecruiter.com'),
  ('governmentjobs_email',  'GovernmentJobs (email)',      'email',    'https://www.governmentjobs.com'),
  ('governmentjobs_direct', 'GovernmentJobs (direct)',     'careers',  'https://www.governmentjobs.com'),
  ('builtin_colorado',      'Built In Colorado',           'aggregator','https://builtin.com/colorado'),
  ('usajobs',               'USAJobs',                     'gov_api',  'https://www.usajobs.gov'),
  ('manual_seed',           'Manual seed',                 'manual',    null),
  ('greenhouse_careers',    'Greenhouse careers',          'ats',      'https://boards.greenhouse.io'),
  ('lever_careers',         'Lever careers',               'ats',      'https://api.lever.co'),
  ('ashby_careers',         'Ashby careers',               'ats',      'https://jobs.ashbyhq.com'),
  ('workday_careers',       'Workday careers',             'ats',       null),
  ('icims_careers',         'iCIMS careers',               'ats',       null),
  ('smartrecruiters_careers','SmartRecruiters careers',    'ats',       null),
  ('workable_careers',      'Workable careers',            'ats',       null),
  ('jsonld_careers',        'JSON-LD careers',             'careers',   null),
  ('career_links_careers',  'Career-page link scrape',     'careers',   null),
  ('dice.com',              'Dice (manual import)',        'manual',   'https://www.dice.com'),
  ('blueorigin.com',        'Blue Origin (manual import)', 'manual',   'https://www.blueorigin.com'),
  ('ball.com',              'Ball (manual import)',        'manual',   'https://www.ball.com')
on conflict (source_type) do nothing;

----------------------------------------------------------------------
-- sync_runs
----------------------------------------------------------------------
create table if not exists public.sync_runs (
  id              bigserial primary key,
  source_type     text,
  triggered_by    text not null default 'cron', -- cron | manual | replay | adapter
  status          text not null default 'running', -- running | completed | error | partial
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  duration_ms     integer,
  inserted        integer not null default 0,
  updated         integer not null default 0,
  closed          integer not null default 0,
  skipped         integer not null default 0,
  errors          integer not null default 0,
  warnings        jsonb not null default '[]'::jsonb,
  params          jsonb not null default '{}'::jsonb,
  result          jsonb,
  error_text      text
);

create index if not exists sync_runs_source_started_idx
  on public.sync_runs (source_type, started_at desc);
create index if not exists sync_runs_status_idx
  on public.sync_runs (status);

----------------------------------------------------------------------
-- job_listings provenance (additive)
----------------------------------------------------------------------
alter table public.job_listings
  add column if not exists source_url text,
  add column if not exists apply_url text,
  add column if not exists normalized_hash text,
  add column if not exists closed_at timestamptz;

-- Composite index helps the dedupe lookup that already happens on every
-- ingest cycle. IF NOT EXISTS keeps re-runs safe.
create index if not exists job_listings_source_external_idx
  on public.job_listings (source, external_job_key);

create index if not exists job_listings_normalized_hash_idx
  on public.job_listings (normalized_hash);

create index if not exists job_listings_closed_at_idx
  on public.job_listings (closed_at);

-- Backfill: seed apply_url from job_url where it's null. job_url stays as
-- the canonical "where do I send Kohler?" link; source_url is reserved for
-- the original posting page when adapters know it.
update public.job_listings
  set apply_url = job_url
  where apply_url is null and job_url is not null;
