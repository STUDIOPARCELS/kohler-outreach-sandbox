import { requireAppOrigin } from "@/lib/auth";
import { getCommandCenterJobUrl, shouldShowJobInCommandCenter } from "@/lib/jobCommandCenter";
import { getReliableJobUrl } from "@/lib/jobLinks";
import { scoreJobForKohler } from "@/lib/kohlerFitScore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const companyname = req.nextUrl.searchParams.get("companyname");
  const sourceFilter = req.nextUrl.searchParams.get("source");

  let query = supabaseAdmin
    .from("job_listings")
    .select("id, companyname, title, salary, location, employment_type, job_url, apply_url, received_at, source, ingest_status, is_relevant, match_score, relevance_reason, first_seen_at, last_seen_at, times_seen")
    .eq("is_relevant", true)
    .in("ingest_status", ["new", "open"]);

  if (companyname) query = query.eq("companyname", companyname);
  if (sourceFilter === "career_pages") {
    query = query.in("source", ["jsonld_careers", "career_links_careers"]);
  } else if (sourceFilter === "government") {
    query = query.in("source", ["governmentjobs_email", "governmentjobs_direct", "usajobs"]);
  } else if (sourceFilter && sourceFilter !== "all") {
    query = query.eq("source", sourceFilter);
  }
  query = query.order("received_at", { ascending: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapped = (data || [])
    .map((r) => ({ ...r, reliable_url: getReliableJobUrl(r) }))
    .map((r) => {
      const fit = scoreJobForKohler({
        title: r.title,
        companyname: r.companyname,
        location: r.location,
        source: r.source,
        match_score: r.match_score,
        is_relevant: r.is_relevant,
        relevance_reason: r.relevance_reason,
      });
      const show = shouldShowJobInCommandCenter({
        title: r.title,
        companyname: r.companyname,
        location: r.location,
        source: r.source,
        match_score: r.match_score,
        is_relevant: r.is_relevant,
        relevance_reason: r.relevance_reason,
        job_url: r.job_url,
        apply_url: r.apply_url,
        reliable_url: r.reliable_url,
      }, fit);
      return {
        show,
        title: r.title,
        location: r.location,
        work_type: r.employment_type,
        salary: r.salary,
        url: getCommandCenterJobUrl(r),
        date_posted: r.received_at,
        source: r.source,
        first_seen: r.first_seen_at,
        last_seen: r.last_seen_at,
        times_seen: r.times_seen,
        fit_score: fit.overall_score,
        pe_track_score: fit.pe_track_score,
        recommended_action: fit.recommended_action,
        explanation_summary: fit.explanation_summary,
      };
    })
    .filter((r) => r.show)
    .map(({ show, ...r }) => r);

  return NextResponse.json(mapped);
}
