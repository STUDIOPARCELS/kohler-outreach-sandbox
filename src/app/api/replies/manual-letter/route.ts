import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ACTIONABLE = ["positive_reply", "recruiter_screen", "apply_online", "referral", "needs_follow_up"];
const VALID_CLASSIFICATIONS = [
  "positive_reply",
  "recruiter_screen",
  "apply_online",
  "referral",
  "needs_follow_up",
  "rejection",
  "out_of_office",
  "auto_reply",
  "unknown",
];

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseReceivedAt(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return new Date().toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function classification(value: unknown): string {
  return typeof value === "string" && VALID_CLASSIFICATIONS.includes(value) ? value : "positive_reply";
}

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const sentMessageId = text(body.sentMessageId);
  if (!sentMessageId) {
    return NextResponse.json({ error: "Choose the letter this reply belongs to." }, { status: 400 });
  }

  const { data: sentMessage, error: sentError } = await supabaseAdmin
    .from("sent_messages")
    .select("id, outreach_id, source_id, channel, companyname, contact_email, subject, sent_at, metadata")
    .eq("id", sentMessageId)
    .maybeSingle();

  if (sentError) return NextResponse.json({ error: sentError.message }, { status: 500 });
  if (!sentMessage || sentMessage.channel !== "letter") {
    return NextResponse.json({ error: "Selected outbound record is not a physical letter." }, { status: 400 });
  }

  const receivedAt = parseReceivedAt(body.receivedAt);
  const replyClassification = classification(body.classification);
  const subject = text(body.subject) || `Manual letter reply - ${sentMessage.companyname || "unknown company"}`;
  const snippet = text(body.snippet) || text(body.body) || "(manual letter reply)";
  const contactEmail = text(body.fromEmail) || text(body.contactEmail) || sentMessage.contact_email || null;
  const contactName = text(body.contactName) || (sentMessage.metadata as { contactname?: string | null } | null)?.contactname || null;
  const threadKey = `manual-letter:${sentMessage.source_id || sentMessage.outreach_id || sentMessage.id}`;
  const now = new Date().toISOString();

  const { data: existingThread, error: threadLookupError } = await supabaseAdmin
    .from("email_threads")
    .select("id, first_message_at, last_message_at")
    .eq("gmail_thread_id", threadKey)
    .maybeSingle();
  if (threadLookupError) return NextResponse.json({ error: threadLookupError.message }, { status: 500 });

  const threadPayload = {
    gmail_thread_id: threadKey,
    companyname: sentMessage.companyname,
    contact_email: contactEmail,
    outreach_id: sentMessage.outreach_id,
    matched_by: "manual_letter_entry",
    first_message_at:
      existingThread?.first_message_at && existingThread.first_message_at < receivedAt ? existingThread.first_message_at : receivedAt,
    last_message_at:
      existingThread?.last_message_at && existingThread.last_message_at > receivedAt ? existingThread.last_message_at : receivedAt,
    classification: replyClassification,
    needs_follow_up: ACTIONABLE.includes(replyClassification),
    metadata: {
      source: "manual_letter_reply",
      channel: "letter",
      sent_message_id: sentMessage.id,
      original_letter_sent_at: sentMessage.sent_at,
      entered_at: now,
    },
  };

  const { data: threadRows, error: threadError } = await supabaseAdmin
    .from("email_threads")
    .upsert(threadPayload, { onConflict: "gmail_thread_id" })
    .select("id")
    .limit(1);
  if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 });

  const emailThreadId = threadRows?.[0]?.id || existingThread?.id || null;
  const messageId = `${threadKey}:${randomUUID()}`;
  const { data: messageRows, error: messageError } = await supabaseAdmin
    .from("email_messages")
    .insert({
      email_thread_id: emailThreadId,
      gmail_thread_id: threadKey,
      gmail_message_id: messageId,
      direction: "incoming",
      from_email: contactEmail,
      to_emails: [],
      subject,
      snippet,
      received_at: receivedAt,
      classification: replyClassification,
      is_auto_reply: ["out_of_office", "auto_reply"].includes(replyClassification),
      raw_headers: {},
      metadata: {
        source: "manual_letter_reply",
        channel: "letter",
        contact_email: contactEmail,
        contact_name: contactName,
        companyname: sentMessage.companyname,
        matched_outreach_id: sentMessage.outreach_id,
        matched_by: "manual_letter_entry",
        sent_message_id: sentMessage.id,
        original_letter_sent_at: sentMessage.sent_at,
        entered_at: now,
      },
    })
    .select("id, classification, metadata")
    .limit(1);

  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    message: messageRows?.[0] || null,
    threadId: emailThreadId,
  });
}
