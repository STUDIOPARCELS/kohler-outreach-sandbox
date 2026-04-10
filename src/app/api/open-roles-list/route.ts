import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const sourceFilter = req.nextUrl.searchParams.get("source");

  let query = supabaseAdmin
    .from("job_listings")
    .select("companyname, company_id, title, source, ingest_status, is_relevant, first_seen_at, last_seen_at, times_seen")
    .in("ingest_status", ["new", "open"])
    .eq("is_relevant", true);

  if (sourceFilter && sourceFilter !== "all") {
    query = query.eq("source", sourceFilter);
  }

  const { data: allJobs, error } = await query;

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const jobs = allJobs || [];
  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const totalRoles = jobs.length;
  const companySet = new Set(jobs.map(j => j.company_id?.toString() || j.companyname));
  const newRoles24h = jobs.filter(j => j.first_seen_at && new Date(j.first_seen_at) >= h24).length;
  const updatedExisting24h = jobs.filter(j =>
    j.last_seen_at && new Date(j.last_seen_at) >= h24 &&
    j.first_seen_at && new Date(j.first_seen_at) < h24
  ).length;
  const newZR24h = jobs.filter(j => j.source === "ziprecruiter_email" && j.first_seen_at && new Date(j.first_seen_at) >= h24).length;
  const newGov24h = jobs.filter(j => j.source === "governmentjobs_email" && j.first_seen_at && new Date(j.first_seen_at) >= h24).length;
  const newRoles7d = jobs.filter(j => j.first_seen_at && new Date(j.first_seen_at) >= d7).length;
  const newRoles30d = jobs.filter(j => j.first_seen_at && new Date(j.first_seen_at) >= d30).length;

  const bySource: Record<string, number> = {};
  for (const j of jobs) {
    bySource[j.source] = (bySource[j.source] || 0) + 1;
  }

  // Build company list from job_listings directly (not dependent on companies table)
  const companyMap = new Map<string, { roles: number; company_id: number | null }>();
  for (const j of jobs) {
    const existing = companyMap.get(j.companyname);
    if (existing) {
      existing.roles++;
    } else {
      companyMap.set(j.companyname, { roles: 1, company_id: j.company_id });
    }
  }

  // Enrich with companies table data where available
  const companyNames = Array.from(companyMap.keys());
  const { data: companyDetails } = await supabaseAdmin
    .from("companies")
    .select("companyname, tier, city, niche")
    .in("companyname", companyNames);

  const detailMap = new Map<string, { tier: number; city: string; niche: string }>();
  for (const c of companyDetails || []) {
    detailMap.set(c.companyname, { tier: c.tier, city: c.city, niche: c.niche });
  }

  const rows = companyNames.map(name => {
    const entry = companyMap.get(name)!;
    const detail = detailMap.get(name);
    return {
      companyname: name,
      tier: detail?.tier || 5,
      city: detail?.city || null,
      niche: detail?.niche || null,
      roles: entry.roles,
    };
  }).sort((a, b) => a.tier - b.tier || b.roles - a.roles);

  return NextResponse.json({
    stats: {
      totalRoles,
      companies: companySet.size,
      newRoles24h,
      updatedExisting24h,
      newRoles7d,
      newRoles30d,
      newZR24h,
      newGov24h,
      bySource,
    },
    companies: rows,
  });
}
