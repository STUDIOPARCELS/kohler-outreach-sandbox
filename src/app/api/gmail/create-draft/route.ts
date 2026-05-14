// Phase 9 — POST /api/gmail/create-draft
//   { draft_id, mode? }
//
// Creates a Gmail draft (or sends if mode="send" + ENABLE_LIVE_SEND +
// human_approved). Updates `email_drafts` with gmail_draft_id /
// gmail_message_id / gmail_thread_id and inserts a `sent_messages` row.

import { NextRequest, NextResponse } from "next/server";
import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchGmailMessage, pickSendMode, type SendMode } from "@/lib/gmail/draft";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RequestBody {
  draft_id?: number;
  mode?: SendMode;
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

  const { data: draft, error } = await supabaseAdmin
    .from("email_drafts")
    .select(
      "id, outreach_action_id, to_email, to_name, reply_to, subject, body_html, body_text, status, gmail_thread_id"
    )
    .eq("id", body.draft_id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!draft) return NextResponse.json({ error: `draft ${body.draft_id} not found` }, { status: 404 });

  if (!draft.to_email) {
    return NextResponse.json({ error: "draft has no to_email" }, { status: 400 });
  }

  const mode = pickSendMode({
    explicit: body.mode,
    approved: draft.status === "human_approved",
  });

  const result = await dispatchGmailMessage({
    message: {
      to_email: draft.to_email,
      to_name: draft.to_name,
      reply_to: draft.reply_to,
      subject: draft.subject,
      body_text: draft.body_text,
      body_html: draft.body_html,
      thread_id: draft.gmail_thread_id,
    },
    mode,
  });

  const newStatus = result.mode === "send" ? "sent" : result.mode === "draft" ? "gmail_drafted" : draft.status;
  const update: Record<string, unknown> = {
    status: newStatus,
    gmail_draft_id: result.gmail_draft_id,
    gmail_message_id: result.gmail_message_id,
    gmail_thread_id: result.gmail_thread_id,
    updated_at: new Date().toISOString(),
  };
  if (result.mode === "send") update.sent_at = new Date().toISOString();

  await supabaseAdmin.from("email_drafts").update(update).eq("id", draft.id);

  if (result.mode !== "dry_run") {
    await supabaseAdmin.from("sent_messages").insert({
      email_draft_id: draft.id,
      outreach_action_id: draft.outreach_action_id ?? null,
      to_email: draft.to_email,
      to_name: draft.to_name,
      subject: draft.subject,
      body_text: draft.body_text,
      gmail_message_id: result.gmail_message_id,
      gmail_thread_id: result.gmail_thread_id,
      delivery_mode: result.mode === "send" ? "gmail_send" : "gmail_draft",
      sent_at: result.mode === "send" ? new Date().toISOString() : null,
    });
  }

  if (result.mode === "send" && draft.outreach_action_id) {
    await supabaseAdmin
      .from("outreach_actions")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", draft.outreach_action_id);
  }

  return NextResponse.json({
    ok: true,
    draft_id: draft.id,
    mode: result.mode,
    gmail_draft_id: result.gmail_draft_id,
    gmail_message_id: result.gmail_message_id,
    gmail_thread_id: result.gmail_thread_id,
    warnings: result.warnings,
  });
}
