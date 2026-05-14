import { isMissingTableError, optionalDbErrorMessage } from "@/lib/optionalDb";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SyncRunStatus = "running" | "completed" | "completed_with_errors" | "error" | "skipped";

export interface SyncRunHandle {
  id: string | null;
  persisted: boolean;
  startedAt: string;
  disabledReason?: string;
}

export interface StartSyncRunInput {
  provider: string;
  sourceType: string;
  companyname?: string | null;
  triggerType?: string | null;
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
}

export interface FinishSyncRunInput {
  status: Exclude<SyncRunStatus, "running">;
  companiesChecked?: number;
  jobsFound?: number;
  jobsRelevant?: number;
  jobsInserted?: number;
  jobsUpdated?: number;
  jobsSkipped?: number;
  errors?: Array<string | Record<string, unknown>>;
  metadata?: Record<string, unknown>;
}

function elapsedMs(startedAt: string, finishedAt: string): number {
  return Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
}

export async function startSyncRun(input: StartSyncRunInput): Promise<SyncRunHandle> {
  const startedAt = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("sync_runs")
    .insert({
      provider: input.provider,
      source_type: input.sourceType,
      companyname: input.companyname || null,
      status: "running",
      trigger_type: input.triggerType || null,
      dry_run: !!input.dryRun,
      started_at: startedAt,
      metadata: input.metadata || {},
    })
    .select("id")
    .single();

  if (error) {
    return {
      id: null,
      persisted: false,
      startedAt,
      disabledReason: isMissingTableError(error, "sync_runs")
        ? "sync_runs table not applied"
        : optionalDbErrorMessage(error),
    };
  }

  return { id: data?.id || null, persisted: Boolean(data?.id), startedAt };
}

export async function finishSyncRun(handle: SyncRunHandle, input: FinishSyncRunInput): Promise<void> {
  if (!handle.persisted || !handle.id) return;

  const finishedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("sync_runs")
    .update({
      status: input.status,
      finished_at: finishedAt,
      duration_ms: elapsedMs(handle.startedAt, finishedAt),
      companies_checked: input.companiesChecked || 0,
      jobs_found: input.jobsFound || 0,
      jobs_relevant: input.jobsRelevant || 0,
      jobs_inserted: input.jobsInserted || 0,
      jobs_updated: input.jobsUpdated || 0,
      jobs_skipped: input.jobsSkipped || 0,
      errors: input.errors || [],
      metadata: input.metadata || {},
      updated_at: finishedAt,
    })
    .eq("id", handle.id);

  if (error && !isMissingTableError(error, "sync_runs")) {
    console.warn("sync_runs update failed:", optionalDbErrorMessage(error));
  }
}
