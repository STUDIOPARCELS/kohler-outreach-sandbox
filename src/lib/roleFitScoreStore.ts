import { scoreJobForKohler, type JobFitInput, type KohlerFitScore } from "@/lib/kohlerFitScore";
import { isMissingTableError, optionalDbErrorMessage } from "@/lib/optionalDb";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const ROLE_FIT_SCORE_VERSION = "kohler-fit-v1";

export interface RoleFitJobRow extends JobFitInput {
  id?: string | number | null;
  external_job_key?: string | null;
}

export interface RoleFitPersistenceContext {
  contact_count?: number | null;
  email_count?: number | null;
  is_mines_alumni?: boolean | null;
}

export interface RoleFitScoreRow {
  job_listing_id: string;
  companyname: string | null;
  source: string | null;
  external_job_key: string | null;
  score_version: string;
  skill_fit_score: number;
  entry_level_score: number;
  pe_track_score: number;
  niche_score: number;
  location_score: number;
  mines_signal_score: number;
  overall_score: number;
  recommended_action: string;
  explanation_summary: string;
  explanation_json: KohlerFitScore["explanation_json"];
  scored_at: string;
  updated_at: string;
}

export interface RoleFitPersistenceResult {
  fit: KohlerFitScore;
  row: RoleFitScoreRow;
  persisted: boolean;
  missingTable: boolean;
  error?: string;
}

function jobIdentifier(job: RoleFitJobRow): string {
  const fallback = [job.source, job.companyname, job.title, job.location].filter(Boolean).join("|");
  return String(job.id || job.external_job_key || fallback || "unknown");
}

export function buildRoleFitScoreRow(
  job: RoleFitJobRow,
  context: RoleFitPersistenceContext = {},
  scoredAt = new Date().toISOString()
): { fit: KohlerFitScore; row: RoleFitScoreRow } {
  const fit = scoreJobForKohler({
    ...job,
    contact_count: context.contact_count ?? job.contact_count,
    email_count: context.email_count ?? job.email_count,
    is_mines_alumni: context.is_mines_alumni ?? job.is_mines_alumni,
  });

  return {
    fit,
    row: {
      job_listing_id: jobIdentifier(job),
      companyname: job.companyname || null,
      source: job.source || null,
      external_job_key: job.external_job_key || null,
      score_version: ROLE_FIT_SCORE_VERSION,
      skill_fit_score: fit.skill_fit_score,
      entry_level_score: fit.entry_level_score,
      pe_track_score: fit.pe_track_score,
      niche_score: fit.niche_score,
      location_score: fit.location_score,
      mines_signal_score: fit.mines_signal_score,
      overall_score: fit.overall_score,
      recommended_action: fit.recommended_action,
      explanation_summary: fit.explanation_summary,
      explanation_json: fit.explanation_json,
      scored_at: scoredAt,
      updated_at: scoredAt,
    },
  };
}

export async function persistRoleFitScore(
  job: RoleFitJobRow,
  context: RoleFitPersistenceContext = {}
): Promise<RoleFitPersistenceResult> {
  const { fit, row } = buildRoleFitScoreRow(job, context);
  const { error } = await supabaseAdmin
    .from("role_fit_scores")
    .upsert(row, { onConflict: "job_listing_id,score_version" });

  if (error) {
    return {
      fit,
      row,
      persisted: false,
      missingTable: isMissingTableError(error, "role_fit_scores"),
      error: optionalDbErrorMessage(error),
    };
  }

  return { fit, row, persisted: true, missingTable: false };
}
