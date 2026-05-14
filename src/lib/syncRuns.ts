// Helpers for recording adapter sync runs against the live `sync_runs`
// table in KOHLER OS (acwgirrldntjpzrhqmdh).
//
// Schema reference (from docs/supabase-schema-baseline.md, verified
// 2026-05-14 via Supabase MCP):
//
//   sync_runs columns:
//     id uuid PK
//     job_source_id uuid FK→job_sources (nullable)
//     provider text
//     source_type text
//     companyname text (nullable)
//     status text — check (running|completed|completed_with_errors|error|skipped)
//     trigger_type text (nullable)
//     dry_run bool default false
//     started_at timestamptz default now()
//     finished_at timestamptz (nullable)
//     duration_ms int (nullable)
//     companies_checked int default 0
//     jobs_found int default 0
//     jobs_relevant int default 0
//     jobs_inserted int default 0
//     jobs_updated int default 0
//     jobs_skipped int default 0
//     errors jsonb default '[]'::jsonb
//     metadata jsonb default '{}'::jsonb
//     created_at, updated_at timestamptz
//
// Notes:
//   - `id` is a uuid string, not an int.
//   - There is NO `inserted/updated/closed/skipped` int column — those are
//     `jobs_inserted/jobs_updated/jobs_skipped`. There is no `closed`.
//   - `errors` is a jsonb array, not an int count. The count is implicit
//     from `errors.length`.
//   - `params`, `warnings`, `result`, `error_text` columns do NOT exist;
//     they all fold into the `metadata` jsonb column under those keys.
//   - `status="partial"` is NOT a valid value — use `completed_with_errors`.

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SyncRunStatus =
  | "running"
  | "completed"
  | "completed_with_errors"
  | "error"
  | "skipped";

export type SyncRunTrigger =
  | "cron"
  | "manual"
  | "replay"
  | "adapter"
  | (string & {});

export interface SyncRunHandle {
  id: string | null;
  sourceType: string | null;
  provider: string | null;
  companyname: string | null;
  startedAt: string;
}

export interface SyncRunCounts {
  companiesChecked?: number;
  jobsFound?: number;
  jobsRelevant?: number;
  jobsInserted?: number;
  jobsUpdated?: number;
  jobsSkipped?: number;
}

export interface SyncRunExtras {
  /** Pushed into the `errors` jsonb column as an array of strings. */
  errors?: string[];
  /** Folded into `metadata.warnings`. */
  warnings?: string[];
  /** Folded into `metadata.result`. */
  result?: Record<string, unknown>;
  /** Folded into `metadata.error_text` (single string for fatal failures). */
  errorText?: string;
}

let warnedMissingTable = false;

function isMissingTableError(message: string | null | undefined): boolean {
  return (
    typeof message === "string" &&
    /relation\s+"?(public\.)?sync_runs"?\s+does not exist/i.test(message)
  );
}

async function tryInsert(
  row: Record<string, unknown>
): Promise<{ id: string | null; missing: boolean }> {
  const { data, error } = await supabaseAdmin
    .from("sync_runs")
    .insert(row)
    .select("id")
    .single();

  if (!error) {
    return { id: (data as { id: string } | null)?.id ?? null, missing: false };
  }

  if (isMissingTableError(error.message)) {
    if (!warnedMissingTable) {
      console.warn(
        "[syncRuns] sync_runs table not found in this project — adapter sync runs will not be recorded."
      );
      warnedMissingTable = true;
    }
    return { id: null, missing: true };
  }

  console.error("[syncRuns] insert failed:", error.message);
  return { id: null, missing: false };
}

async function tryUpdate(
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin.from("sync_runs").update(patch).eq("id", id);
  if (!error) return;
  if (isMissingTableError(error.message)) return;
  console.error("[syncRuns] update failed:", error.message);
}

export async function startSyncRun(opts: {
  sourceType: string | null;
  provider?: string | null;
  companyname?: string | null;
  triggerType?: SyncRunTrigger;
  dryRun?: boolean;
  params?: Record<string, unknown>;
}): Promise<SyncRunHandle> {
  const startedAt = new Date().toISOString();
  const provider = opts.provider ?? opts.sourceType ?? null;
  const metadata: Record<string, unknown> = {};
  if (opts.params && Object.keys(opts.params).length > 0) {
    metadata.params = opts.params;
  }

  const { id } = await tryInsert({
    source_type: opts.sourceType,
    provider,
    companyname: opts.companyname ?? null,
    status: "running",
    trigger_type: opts.triggerType ?? "adapter",
    dry_run: !!opts.dryRun,
    started_at: startedAt,
    metadata,
  });

  return {
    id,
    sourceType: opts.sourceType,
    provider,
    companyname: opts.companyname ?? null,
    startedAt,
  };
}

export async function finishSyncRun(
  handle: SyncRunHandle,
  status: SyncRunStatus,
  counts: SyncRunCounts = {},
  extras: SyncRunExtras = {}
): Promise<void> {
  if (handle.id == null) return;

  const finishedAt = new Date().toISOString();
  const startedMs = new Date(handle.startedAt).getTime();
  const finishedMs = new Date(finishedAt).getTime();
  const durationMs = Number.isFinite(finishedMs - startedMs)
    ? finishedMs - startedMs
    : null;

  const metadata: Record<string, unknown> = {};
  if (extras.warnings && extras.warnings.length > 0) metadata.warnings = extras.warnings;
  if (extras.result) metadata.result = extras.result;
  if (extras.errorText) metadata.error_text = extras.errorText;

  await tryUpdate(handle.id, {
    status,
    finished_at: finishedAt,
    duration_ms: durationMs,
    companies_checked: counts.companiesChecked ?? 0,
    jobs_found: counts.jobsFound ?? 0,
    jobs_relevant: counts.jobsRelevant ?? 0,
    jobs_inserted: counts.jobsInserted ?? 0,
    jobs_updated: counts.jobsUpdated ?? 0,
    jobs_skipped: counts.jobsSkipped ?? 0,
    errors: extras.errors ?? [],
    metadata,
    updated_at: finishedAt,
  });
}

export async function errorSyncRun(
  handle: SyncRunHandle,
  errorText: string,
  errors: string[] = [],
  warnings: string[] = []
): Promise<void> {
  return finishSyncRun(
    handle,
    "error",
    {},
    {
      errors: errors.length > 0 ? errors : [errorText],
      warnings,
      errorText,
    }
  );
}

/**
 * Map a route-internal "partial" status to the live enum value. Provided
 * so route code can keep using the human term while we write the
 * canonical value.
 */
export function normalizeSyncRunStatus(value: string): SyncRunStatus {
  if (value === "partial") return "completed_with_errors";
  if (value === "running" || value === "completed" || value === "error" || value === "skipped") {
    return value;
  }
  if (value === "completed_with_errors") return value;
  return "completed";
}
