// Phase 8 — record an application. Inserts into `applications` and, when
// the job/outreach action exists, updates the action status to 'sent'.

import { NextRequest, NextResponse } from "next/server";
import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

interface RequestBody {
  job_id?: number;
  outreach_action_id?: number;
  companyname?: string;
  applied_via?: "web" | "recruiter" | "referral" | "letter";
  apply_url?: string | null;
  notes?: string | null;
}

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    /* allow empty */
  }

  if (!body.companyname && !body.job_id) {
    return NextResponse.json({ error: "companyname or job_id required" }, { status: 400 });
  }

  let companyname = body.companyname ?? null;
  if (!companyname && body.job_id) {
    const { data } = await supabaseAdmin
      .from("job_listings")
      .select("companyname")
      .eq("id", body.job_id)
      .maybeSingle();
    companyname = (data as { companyname?: string } | null)?.companyname ?? null;
  }
  if (!companyname) {
    return NextResponse.json({ error: "could not resolve company name" }, { status: 400 });
  }

  const { data: insertRow, error } = await supabaseAdmin
    .from("applications")
    .insert({
      job_id: body.job_id ?? null,
      outreach_action_id: body.outreach_action_id ?? null,
      companyname,
      applied_via: body.applied_via ?? "web",
      apply_url: body.apply_url ?? null,
      notes: body.notes ?? null,
      status: "submitted",
    })
    .select("id, companyname, applied_at")
    .single();

  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json(
        {
          ok: false,
          error: "applications table missing — apply supabase/migrations/0004_outreach_workflow.sql",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (body.outreach_action_id) {
    await supabaseAdmin
      .from("outreach_actions")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", body.outreach_action_id);
  }

  return NextResponse.json({ ok: true, application: insertRow });
}
