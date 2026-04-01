import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;

  // Query job_listings directly — single source of truth
  const { data: jobs, error } = await supabaseAdmin
    .from("job_listings")
    .select("companyname, company_id, title, source, ingest_status")
    .in("ingest_status", ["new", "open"]);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Count roles per company
  const countMap = new Map<string, number>();
  for (const j of jobs || []) {
    countMap.set(j.companyname, (countMap.get(j.companyname) || 0) + 1);
  }

  const companyNames = Array.from(countMap.keys());
  if (companyNames.length === 0) return NextResponse.json([]);

  // Get company details
  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("companyname, tier, city, niche")
    .in("companyname", companyNames)
    .order("tier", { ascending: true });

  const rows = (companies || []).map((co) => ({
    companyname: co.companyname,
    tier: co.tier,
    city: co.city,
    niche: co.niche,
    roles: countMap.get(co.companyname) || 0,
  }));

  return NextResponse.json(rows);
}
