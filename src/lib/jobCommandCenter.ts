import type { JobFitInput, KohlerFitScore } from "@/lib/kohlerFitScore";
import {
  isExcludedStaffingCompany,
  isNonEngineeringJobTitle,
  isTodayExcludedNiche,
  isTodayTargetJob,
} from "@/lib/targeting";

export interface CommandCenterJobInput extends JobFitInput {
  niche?: string | null;
  job_url?: string | null;
  apply_url?: string | null;
  reliable_url?: string | null;
}

export function getCommandCenterJobUrl(job: CommandCenterJobInput): string | null {
  return job.reliable_url || job.apply_url || job.job_url || null;
}

export function shouldShowJobInCommandCenter(
  job: CommandCenterJobInput,
  fit: KohlerFitScore,
): boolean {
  if (job.is_relevant === false) return false;
  if (isTodayExcludedNiche(job.niche)) return false;
  if (isExcludedStaffingCompany(job.companyname)) return false;
  if (isNonEngineeringJobTitle(job.title)) return false;

  const url = getCommandCenterJobUrl(job);
  if (isTodayTargetJob({
    title: job.title,
    companyname: job.companyname,
    niche: job.niche,
    location: job.location,
    is_relevant: job.is_relevant,
    job_url: url,
  })) {
    return true;
  }

  if (fit.recommended_action === "skip") return false;

  return fit.overall_score >= 25 || fit.pe_track_score >= 20 || fit.skill_fit_score >= 18;
}
