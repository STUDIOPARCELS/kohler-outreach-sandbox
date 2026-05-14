// Phase 8 — list outreach actions, optionally filtered by status or company.
// Used by the dashboard / queue UIs.

import { NextRequest, NextResponse } from "next/server";
import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const companyname = url.searchParams.get("companyname");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  let query = supabaseAdmin
    .from("outreach_actions")
    .select(
      "id, campaign_id, company_id, companyname, contact_id, job_id, template_key, recommended_action, status, channel, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (companyname) query = query.ilike("companyname", `%${companyname}%`);

  const { data, error } = await query;
  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json({ ok: true, actions: [], warning: "outreach_actions table missing" });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: data?.length ?? 0, actions: data ?? [] });
}
