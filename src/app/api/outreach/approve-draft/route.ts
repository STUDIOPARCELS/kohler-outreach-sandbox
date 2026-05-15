// Session E — approve a draft. Sets email_drafts.status =
// 'human_approved'. Phase 9 sends only when the draft is
// 'human_approved' AND ENABLE_LIVE_SEND === 'true'.
//
// The linked outreach_actions row is marked 'completed' (its
// action_type was 'create_draft' — the task of producing the draft is
// done once a human approves it). Live outreach_actions.status enum is
// pending|in_progress|completed|skipped|canceled — there is no
// 'human_approved' value on that table.

import { NextRequest, NextResponse } from "next/server";
import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

interface RequestBody {
  draft_id?: string;
  approved_by?: string;
  subject?: string;
  body_text?: string;
  body_html?: string;
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

  if (!body.draft_id) {
    return NextResponse.json({ error: "draft_id required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    status: "human_approved",
    approved_by: body.approved_by ?? "human",
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (body.subject) update.subject = body.subject;
  if (body.body_text) update.body_text = body.body_text;
  if (body.body_html) update.body_html = body.body_html;

  const { data, error } = await supabaseAdmin
    .from("email_drafts")
    .update(update)
    .eq("id", body.draft_id)
    .select("id, outreach_action_id")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (data?.outreach_action_id) {
    await supabaseAdmin
      .from("outreach_actions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.outreach_action_id);
  }

  return NextResponse.json({ ok: true, draft_id: data?.id, outreach_action_id: data?.outreach_action_id });
}
