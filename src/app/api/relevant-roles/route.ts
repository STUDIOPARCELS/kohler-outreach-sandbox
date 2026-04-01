import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const companyname = req.nextUrl.searchParams.get("companyname");

  let query = supabaseAdmin
    .from("job_listings")
    .select("id, companyname, title, salary, location, employment_type, workplace_type, summary, job_url, apply_url, received_at, posted_date, source, ingest_status, company_id");

  if (companyname) {
    query = query.eq("companyname", companyname);
  }
  query = query.order("received_at", { ascending: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map to the shape the Open Roles page expects
  const mapped = (data || []).map((r) => ({
    company_name: r.companyname,
    title: r.title,
    location: r.location,
    work_type: r.employment_type,
    salary: r.salary,
    url: r.job_url || r.apply_url,
    date_posted: r.received_at || r.posted_date,
    source: r.source,
    summary: r.summary,
  }));

  return NextResponse.json(mapped);
}
