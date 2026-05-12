import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isTodayTargetJob } from "@/lib/targeting";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const companyname = req.nextUrl.searchParams.get("companyname");

  let query = supabaseAdmin
    .from("job_listings")
    .select("id, companyname, title, salary, location, employment_type, job_url, apply_url, received_at, source, ingest_status, is_relevant, first_seen_at, last_seen_at, times_seen")
    .eq("is_relevant", true)
    .in("ingest_status", ["new", "open"]);

  if (companyname) query = query.eq("companyname", companyname);
  query = query.order("received_at", { ascending: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapped = (data || [])
    .filter((r) => isTodayTargetJob({
      title: r.title,
      companyname: r.companyname,
      is_relevant: r.is_relevant,
      job_url: r.job_url,
      apply_url: r.apply_url,
    }))
    .map((r) => ({
    title: r.title,
    location: r.location,
    work_type: r.employment_type,
    salary: r.salary,
    url: r.job_url || r.apply_url,
    date_posted: r.received_at,
    source: r.source,
    first_seen: r.first_seen_at,
    last_seen: r.last_seen_at,
    times_seen: r.times_seen,
  }));

  return NextResponse.json(mapped);
}
