import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // Get all relevant roles
  const { data: roles, error: rolesErr } = await supabaseAdmin
    .from("relevant_roles")
    .select("company_name");

  if (rolesErr)
    return NextResponse.json({ error: rolesErr.message }, { status: 500 });

  // Count roles per company
  const countMap = new Map<string, number>();
  for (const r of roles || []) {
    countMap.set(r.company_name, (countMap.get(r.company_name) || 0) + 1);
  }

  // Get company details for those with roles
  const companyNames = Array.from(countMap.keys());
  if (companyNames.length === 0) return NextResponse.json([]);

  const { data: companies, error: compErr } = await supabaseAdmin
    .from("companies")
    .select("companyname, tier, city")
    .in("companyname", companyNames)
    .order("tier", { ascending: true });

  if (compErr)
    return NextResponse.json({ error: compErr.message }, { status: 500 });

  const rows = (companies || []).map((co) => ({
    companyname: co.companyname,
    tier: co.tier,
    city: co.city,
    job_count: countMap.get(co.companyname) || 0,
  }));

  return NextResponse.json(rows);
}
