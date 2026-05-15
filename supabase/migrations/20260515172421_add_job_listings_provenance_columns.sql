-- Session D — job_listings provenance (additive only).
-- Applied to KOHLER OS (acwgirrldntjpzrhqmdh) 2026-05-15 via apply_migration.
-- Reconciled from _drafts/0001: apply_url / first_seen_at / last_seen_at
-- already exist on live job_listings; only these three were missing.

alter table public.job_listings
  add column if not exists source_url text,
  add column if not exists normalized_hash text,
  add column if not exists closed_at timestamptz;

create index if not exists job_listings_normalized_hash_idx on public.job_listings (normalized_hash);
create index if not exists job_listings_closed_at_idx on public.job_listings (closed_at);
create index if not exists job_listings_source_external_idx
  on public.job_listings (source, external_job_key);
