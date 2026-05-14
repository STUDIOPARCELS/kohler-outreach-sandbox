// Session B (reconciled to live KOHLER OS schema 2026-05-14).
//
// Score a job (or batch) for Kohler and persist into role_fit_scores.
//
// Live schema (verified via Supabase MCP):
//   - role_fit_scores.id uuid PK
//   - UNIQUE (job_listing_id text, score_version text)
//   - default score_version 'kohler-fit-v1'  ← 273 EXISTING ROWS, preserve
//   - has companyname text, source text, external_job_key text,
//     explanation_summary text, explanation_json jsonb
//   - check enum on recommended_action matches Phase 5 design
//   - NO `candidate_profile_id` column. NO `job_id` int column.
//
// Strategy: write new rows with score_version = 'kohler-fit-v2'. The 273
// existing v1 rows stay untouched as historical record. Future algorithm
// changes bump to v3, v4, etc.
//
// POST /api/jobs/rescore
//   { job_id?: number,
//     job_ids?: number[],
//     all_relevant?: boolean,
//     limit?: number,
//     dry_run?: boolean,
//     score_version?: string  // defaults to SCORE_VERSION constant
//   }

import { NextRequest, NextResponse } from "next/server";
import { requireApiSecret, requireCronSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { scoreJobForKohler, SCORE_VERSION } from "@/lib/kohlerFitScore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RescoreBody {
  job_id?: number;
  job_ids?: number[];
  all_relevant?: boolean;
  limit?: number;
  dry_run?: boolean;
  score_version?: string;
}

interface JobRow {
  id: number;
  companyname: string;
  company_id: number | null;
  title: string;
  location: string | null;
  niche: string | null; // hydrated from companies.niche after the query
  summary: string | null; // job_listings has `summary`, NOT body_text/description
  job_url: string | null;
  apply_url: string | null;
  source: string | null;
  external_job_key: string | null;
  match_score: number | null;
  is_relevant: boolean | null;
  relevance_reason: string | null;
}

// NOTE on schema gotchas (verified via supabase-schema-baseline.md):
//   - job_listings has NO `niche` column (lives on companies, hydrated below)
//   - job_listings has NO `body_text` and NO `description` columns —
//     the long-form text lives in `summary`
//   - job_listings.id is int4, but role_fit_scores.job_listing_id is text
//     (we stringify when writing)
const SELECT_COLUMNS =
  "id, companyname, company_id, title, location, salary, source, external_job_key, summary, job_url, apply_url, match_score, is_relevant, relevance_reason";

async function hydrateNiches(rows: JobRow[]): Promise<void> {
  const companyIds = Array.from(
    new Set(rows.map((r) => r.company_id).filter((id): id is number => !!id))
  );
  if (companyIds.length === 0) return;
  const { data } = await supabaseAdmin
    .from("companies")
    .select("id, niche")
    .in("id", companyIds);
  const nicheById = new Map<number, string | null>();
  for (const c of (data ?? []) as Array<{ id: number; niche: string | null }>) {
    nicheById.set(c.id, c.niche);
  }
  for (const r of rows) {
    if (r.company_id != null) r.niche = nicheById.get(r.company_id) ?? null;
  }
}

async function loadJobs(body: RescoreBody): Promise<{ rows: JobRow[]; error: { message: string } | null }> {
  let result: { data: JobRow[] | null; error: { message: string } | null } = {
    data: null,
    error: null,
  };

  if (body.job_id) {
    const { data, error } = await supabaseAdmin
      .from("job_listings")
      .select(SELECT_COLUMNS)
      .eq("id", body.job_id);
    result = { data: (data ?? []) as unknown as JobRow[], error };
  } else if (body.job_ids && body.job_ids.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("job_listings")
      .select(SELECT_COLUMNS)
      .in("id", body.job_ids);
    result = { data: (data ?? []) as unknown as JobRow[], error };
  } else if (body.all_relevant) {
    const limit = Math.min(body.limit ?? 200, 1000);
    // job_listings has no `created_at` — use received_at chronologically.
    const { data, error } = await supabaseAdmin
      .from("job_listings")
      .select(SELECT_COLUMNS)
      .eq("is_relevant", true)
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    result = { data: (data ?? []) as unknown as JobRow[], error };
  } else {
    return { rows: [], error: null };
  }

  if (result.error) return { rows: [], error: result.error };
  const rows = result.data ?? [];
  await hydrateNiches(rows);
  return { rows, error: null };
}

export async function POST(req: NextRequest) {
  const apiAuth = requireApiSecret(req);
  if (apiAuth) {
    const cronAuth = requireCronSecret(req);
    if (cronAuth) return cronAuth;
  }

  let body: RescoreBody = {};
  try {
    body = (await req.json()) as RescoreBody;
  } catch {
    /* allow empty */
  }

  const scoreVersion = body.score_version || SCORE_VERSION;

  const { rows, error } = await loadJobs(body);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      scored: 0,
      message: "no rows matched — pass job_id, job_ids[], or all_relevant=true",
    });
  }

  const scored = rows.map((r) => {
    const fit = scoreJobForKohler({
      title: r.title,
      // job_listings.summary is the long-form description equivalent.
      body_text: r.summary,
      description: r.summary,
      location: r.location,
      niche: r.niche,
      company_name: r.companyname,
      match_score: r.match_score,
      is_relevant: r.is_relevant,
      match_reason: r.relevance_reason,
      job_url: r.job_url,
      apply_url: r.apply_url,
    });
    return { jobRow: r, fit };
  });

  if (body.dry_run) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      score_version: scoreVersion,
      scored: scored.length,
      sample: scored.slice(0, 5).map((s) => ({
        job_id: s.jobRow.id,
        companyname: s.jobRow.companyname,
        title: s.jobRow.title,
        overall_score: s.fit.overall_score,
        recommended_action: s.fit.recommended_action,
        pe_track_score: s.fit.pe_track_score,
        notes: s.fit.explanation_json.notes,
      })),
    });
  }

  let persisted = 0;
  const warnings: string[] = [];
  const persisted_ids: string[] = [];

  for (const { jobRow, fit } of scored) {
    const explanationSummary = (fit.explanation_json.notes ?? []).join("; ") || null;
    const { error: upsertErr } = await supabaseAdmin
      .from("role_fit_scores")
      .upsert(
        {
          job_listing_id: String(jobRow.id),
          score_version: scoreVersion,
          companyname: jobRow.companyname,
          source: jobRow.source,
          external_job_key: jobRow.external_job_key,
          skill_fit_score: fit.skill_fit_score,
          entry_level_score: fit.entry_level_score,
          pe_track_score: fit.pe_track_score,
          niche_score: fit.niche_score,
          location_score: fit.location_score,
          mines_signal_score: fit.mines_signal_score,
          overall_score: fit.overall_score,
          recommended_action: fit.recommended_action,
          explanation_summary: explanationSummary,
          explanation_json: fit.explanation_json,
          scored_at: new Date().toISOString(),
        },
        { onConflict: "job_listing_id,score_version" }
      );

    if (upsertErr) {
      warnings.push(`job ${jobRow.id}: ${upsertErr.message}`);
      if (
        /relation\s+"?(public\.)?role_fit_scores"?\s+does not exist/i.test(
          upsertErr.message
        )
      ) {
        return NextResponse.json({
          ok: false,
          scored: scored.length,
          persisted: 0,
          warnings: [
            "role_fit_scores table missing in this project — see docs/supabase-schema-baseline.md",
          ],
        });
      }
    } else {
      persisted++;
      persisted_ids.push(String(jobRow.id));
    }
  }

  return NextResponse.json({
    ok: true,
    score_version: scoreVersion,
    scored: scored.length,
    persisted,
    persisted_ids: persisted_ids.slice(0, 10),
    warnings,
  });
}
