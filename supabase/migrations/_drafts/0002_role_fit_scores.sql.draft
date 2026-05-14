-- Phase 5 — Per-row Kohler fit scoring (additive only).
--
-- Adds `role_fit_scores` so the UI can sort/explain why a job is hot for
-- Kohler without re-running the scoring function on every page load.
-- Adds `candidate_profile` only if the table is missing — Kohler's project
-- already has a `candidate_profile` table with at least an `id` column,
-- so this migration only seeds row id=1 if absent.

create table if not exists public.role_fit_scores (
  id                    bigserial primary key,
  job_id                bigint not null references public.job_listings(id) on delete cascade,
  candidate_profile_id  bigint not null default 1,
  skill_fit_score       integer not null default 0,
  entry_level_score     integer not null default 0,
  pe_track_score        integer not null default 0,
  niche_score           integer not null default 0,
  location_score        integer not null default 0,
  mines_signal_score    integer not null default 0,
  overall_score         integer not null default 0,
  recommended_action    text not null default 'monitor',
  explanation_json      jsonb not null default '{}'::jsonb,
  scored_at             timestamptz not null default now(),
  unique (job_id, candidate_profile_id)
);

create index if not exists role_fit_scores_overall_idx
  on public.role_fit_scores (overall_score desc);
create index if not exists role_fit_scores_action_idx
  on public.role_fit_scores (recommended_action);
create index if not exists role_fit_scores_pe_idx
  on public.role_fit_scores (pe_track_score desc);

-- Defensive seeding of candidate_profile in case the table exists but row 1
-- has not been created. Skipped silently if the table is missing.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'candidate_profile'
  ) then
    insert into public.candidate_profile (id)
    values (1)
    on conflict (id) do nothing;
  end if;
end $$;
