// Generic persistence path for normalized adapter output. Writes to
// `job_listings` with the new provenance columns, runs the existing
// `scoreTargetRole` for relevance, and counts inserts/updates/skips.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { scoreTargetRole } from "@/lib/targeting";
import {
  buildExternalJobKey,
  normalizedHash,
} from "./normalization";
import type { NormalizedJob } from "./types";

export interface PersistCounts {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

export async function persistNormalizedJobs(
  jobs: NormalizedJob[]
): Promise<{ counts: PersistCounts; errors: string[] }> {
  const counts: PersistCounts = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  const errors: string[] = [];
  if (jobs.length === 0) return { counts, errors };

  const now = new Date().toISOString();

  for (const job of jobs) {
    try {
      const relevance = scoreTargetRole(
        job.title,
        job.location,
        job.body_text || undefined
      );
      const externalKey =
        ((job.raw_payload as { external_job_key?: string } | null)
          ?.external_job_key as string | undefined) ??
        buildExternalJobKey({
          source_type: job.source_type,
          upstream_id: job.external_job_id ?? undefined,
          company: job.company_name,
          title: job.title,
          location: job.location,
        });
      const hash = normalizedHash({
        company: job.company_name,
        title: job.title,
        location: job.location,
        apply_url: job.apply_url,
      });

      const { data: existing, error: existingErr } = await supabaseAdmin
        .from("job_listings")
        .select("id, times_seen, first_seen_at")
        .eq("source", job.source_type)
        .eq("external_job_key", externalKey)
        .maybeSingle();

      if (existingErr) {
        counts.errors++;
        errors.push(`select existing failed: ${existingErr.message}`);
        continue;
      }

      if (existing) {
        const { error: updateErr } = await supabaseAdmin
          .from("job_listings")
          .update({
            last_seen_at: now,
            times_seen: (existing.times_seen || 1) + 1,
            salary: job.salary || undefined,
            location: job.location || undefined,
            source_url: job.source_url || undefined,
            apply_url: job.apply_url || undefined,
            normalized_hash: hash,
            ingest_status: "open",
            is_relevant: relevance.is_relevant,
            match_score: relevance.match_score,
            relevance_reason: relevance.relevance_reason,
            closed_at: null,
          })
          .eq("id", existing.id);
        if (updateErr) {
          counts.errors++;
          errors.push(`update failed: ${updateErr.message}`);
        } else {
          counts.updated++;
        }
        continue;
      }

      // Skip clearly off-target jobs to keep job_listings small. We still
      // honour adapter output; targeting only filters non-engineering roles.
      if (!relevance.is_relevant && relevance.match_score < -10) {
        counts.skipped++;
        continue;
      }

      const { error: insertErr } = await supabaseAdmin
        .from("job_listings")
        .insert({
          companyname: job.company_name,
          company_id: job.company_id ?? null,
          title: job.title,
          salary: job.salary || null,
          location: job.location || null,
          source: job.source_type,
          external_job_key: externalKey,
          source_url: job.source_url || null,
          apply_url: job.apply_url || null,
          job_url: job.apply_url || job.source_url || null,
          normalized_hash: hash,
          received_at: job.posted_at || now,
          first_seen_at: now,
          last_seen_at: now,
          times_seen: 1,
          is_relevant: relevance.is_relevant,
          match_score: relevance.match_score,
          relevance_reason: relevance.relevance_reason,
          raw_payload: job.raw_payload ?? null,
          ingest_status: "new",
          parser_version:
            Number.isFinite(Number(job.parser_version))
              ? Number(job.parser_version)
              : null,
        });
      if (insertErr) {
        counts.errors++;
        errors.push(`insert failed: ${insertErr.message}`);
      } else {
        counts.inserted++;
      }
    } catch (err) {
      counts.errors++;
      errors.push(`row threw: ${(err as Error).message}`);
    }
  }

  return { counts, errors };
}
