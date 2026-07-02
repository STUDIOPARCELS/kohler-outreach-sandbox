-- Allow the "abandoned" sync_runs status used by the self-healing stale-run
-- cleanup in src/lib/syncRunStore.ts: when a new sync run starts, prior rows
-- stuck in "running" for over 2 hours are marked "abandoned" so a killed run
-- is visible instead of eternally "running".
--
-- The original inline check constraint (202605140001_job_intelligence_spine.sql)
-- gets the default name sync_runs_status_check.

alter table public.sync_runs
  drop constraint if exists sync_runs_status_check;

alter table public.sync_runs
  add constraint sync_runs_status_check
  check (status in ('running', 'completed', 'completed_with_errors', 'error', 'skipped', 'abandoned'));
