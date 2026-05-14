// Helpers for recording adapter sync runs. Prefers the new `sync_runs`
// table introduced in supabase/migrations/0001_provenance.sql. Falls back
// to a no-op (with a warning logged) when the table is missing so that
// adapters still work in environments that haven't applied the migration.

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SyncRunStatus = "running" | "completed" | "error" | "partial";

export interface SyncRunHandle {
  id: number | null;
  sourceType: string | null;
  startedAt: string;
}

export interface SyncRunCounts {
  inserted?: number;
  updated?: number;
  closed?: number;
  skipped?: number;
  errors?: number;
}

let warnedMissingTable = false;

async function tryInsert(row: Record<string, unknown>): Promise<{ id: number | null; missing: boolean }> {
  const { data, error } = await supabaseAdmin
    .from("sync_runs")
    .insert(row)
    .select("id")
    .single();

  if (!error) return { id: (data as { id: number } | null)?.id ?? null, missing: false };

  // 42P01 = undefined_table. Treat as "migration not yet applied" and warn
  // exactly once per process so the boot logs stay clean.
  if (
    typeof error.message === "string" &&
    /relation\s+"?(public\.)?sync_runs"?\s+does not exist/i.test(error.message)
  ) {
    if (!warnedMissingTable) {
      console.warn(
        "[syncRuns] sync_runs table not found — apply supabase/migrations/0001_provenance.sql to enable run tracking."
      );
      warnedMissingTable = true;
    }
    return { id: null, missing: true };
  }

  console.error("[syncRuns] insert failed:", error.message);
  return { id: null, missing: false };
}

export async function startSyncRun(opts: {
  sourceType: string | null;
  triggeredBy?: "cron" | "manual" | "replay" | "adapter";
  params?: Record<string, unknown>;
}): Promise<SyncRunHandle> {
  const startedAt = new Date().toISOString();
  const { id } = await tryInsert({
    source_type: opts.sourceType,
    triggered_by: opts.triggeredBy ?? "adapter",
    status: "running",
    started_at: startedAt,
    params: opts.params ?? {},
  });
  return { id, sourceType: opts.sourceType, startedAt };
}

async function tryUpdate(
  id: number,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin.from("sync_runs").update(patch).eq("id", id);
  if (!error) return;
  if (
    typeof error.message === "string" &&
    /relation\s+"?(public\.)?sync_runs"?\s+does not exist/i.test(error.message)
  ) {
    return;
  }
  console.error("[syncRuns] update failed:", error.message);
}

export async function finishSyncRun(
  handle: SyncRunHandle,
  status: SyncRunStatus,
  counts: SyncRunCounts = {},
  extras: { warnings?: string[]; result?: Record<string, unknown>; errorText?: string } = {}
): Promise<void> {
  if (handle.id == null) return;
  const finishedAt = new Date().toISOString();
  const startedMs = new Date(handle.startedAt).getTime();
  const finishedMs = new Date(finishedAt).getTime();
  const durationMs = Number.isFinite(finishedMs - startedMs)
    ? finishedMs - startedMs
    : null;
  await tryUpdate(handle.id, {
    status,
    finished_at: finishedAt,
    duration_ms: durationMs,
    inserted: counts.inserted ?? 0,
    updated: counts.updated ?? 0,
    closed: counts.closed ?? 0,
    skipped: counts.skipped ?? 0,
    errors: counts.errors ?? 0,
    warnings: extras.warnings ?? [],
    result: extras.result ?? null,
    error_text: extras.errorText ?? null,
  });
}

export async function errorSyncRun(
  handle: SyncRunHandle,
  errorText: string,
  warnings: string[] = []
): Promise<void> {
  return finishSyncRun(handle, "error", {}, { warnings, errorText });
}
