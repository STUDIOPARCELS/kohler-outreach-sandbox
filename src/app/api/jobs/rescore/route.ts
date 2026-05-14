// Phase 5 — score one job (or a batch) for Kohler and persist to
// role_fit_scores. Falls back to in-memory return when the table is
// missing or candidate_profile.id=1 is absent (so the route stays useful
// before the migration ships).

import { NextRequest, NextResponse } from "next/server";
import { requireApiSecret, requireCronSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { scoreJobForKohler } from "@/lib/kohlerFitScore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RescoreBody {
  job_id?: number;
  job_ids?: number[];
  all_relevant?: boolean;
  limit?: number;
  candidate_profile_id?: number;
  dry_run?: boolean;
}

async function loadJobs(body: RescoreBody) {
  if (body.job_id) {
    const { data, error } = await supabaseAdmin
      .from("job_listings")
      .select("id, companyname, title, location, salary, source, niche, body_text, description, job_url, apply_url, match_score, is_relevant, relevance_reason")
      .eq("id", body.job_id);
    return { rows: data ?? [], error };
  }
  if (body.job_ids && body.job_ids.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("job_listings")
      .select("id, companyname, title, location, salary, source, niche, body_text, description, job_url, apply_url, match_score, is_relevant, relevance_reason")
      .in("id", body.job_ids);
    return { rows: data ?? [], error };
  }
  if (body.all_relevant) {
    const limit = Math.min(body.limit ?? 200, 1000);
    const { data, error } = await supabaseAdmin
      .from("job_listings")
      .select("id, companyname, title, location, salary, source, niche, body_text, description, job_url, apply_url, match_score, is_relevant, relevance_reason")
      .eq("is_relevant", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    return { rows: data ?? [], error };
  }
  return { rows: [] as Array<Record<string, unknown>>, error: null };
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

  const candidateId = body.candidate_profile_id ?? 1;
  const scored = rows.map((row) => {
    const r = row as {
      id: number;
      companyname: string;
      title: string;
      location: string | null;
      niche: string | null;
      body_text: string | null;
      description: string | null;
      job_url: string | null;
      apply_url: string | null;
      match_score: number | null;
      is_relevant: boolean | null;
      relevance_reason: string | null;
    };
    const fit = scoreJobForKohler(
      {
        title: r.title,
        body_text: r.body_text,
        description: r.description,
        location: r.location,
        niche: r.niche,
        company_name: r.companyname,
        match_score: r.match_score,
        is_relevant: r.is_relevant,
        match_reason: r.relevance_reason,
        job_url: r.job_url,
        apply_url: r.apply_url,
      },
      undefined
    );
    return { jobId: r.id, fit };
  });

  if (body.dry_run) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      scored: scored.length,
      sample: scored.slice(0, 5),
    });
  }

  let persisted = 0;
  let warnings: string[] = [];
  for (const { jobId, fit } of scored) {
    const { error: upsertErr } = await supabaseAdmin
      .from("role_fit_scores")
      .upsert(
        {
          job_id: jobId,
          candidate_profile_id: candidateId,
          ...fit,
          scored_at: new Date().toISOString(),
        },
        { onConflict: "job_id,candidate_profile_id" }
      );
    if (upsertErr) {
      warnings.push(`job ${jobId}: ${upsertErr.message}`);
      // The migration may not be applied yet — degrade gracefully.
      if (
        /relation\s+"?(public\.)?role_fit_scores"?\s+does not exist/i.test(
          upsertErr.message
        )
      ) {
        warnings = [
          "role_fit_scores table missing — apply supabase/migrations/0002_role_fit_scores.sql",
        ];
        return NextResponse.json({
          ok: false,
          scored: scored.length,
          persisted: 0,
          warnings,
        });
      }
    } else {
      persisted++;
    }
  }

  return NextResponse.json({
    ok: true,
    scored: scored.length,
    persisted,
    warnings,
  });
}
