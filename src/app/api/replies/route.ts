import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function countBy<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = String(row[key] || "unknown");
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 100), 250);

  const [{ data: messages, error: messagesError }, { count: sentCount }, { count: threadCount }] = await Promise.all([
    supabaseAdmin
      .from("email_messages")
      .select("id, gmail_message_id, gmail_thread_id, direction, from_email, subject, snippet, received_at, classification, is_auto_reply, metadata")
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(limit),
    supabaseAdmin.from("sent_messages").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("email_threads").select("*", { count: "exact", head: true }),
  ]);

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  const rows = messages || [];

  return NextResponse.json({
    messages: rows,
    counts: {
      sent: sentCount || 0,
      threads: threadCount || 0,
      messages: rows.length,
      byClassification: countBy(rows, "classification"),
      actionable: rows.filter((row) =>
        ["positive_reply", "recruiter_screen", "apply_online", "referral", "needs_follow_up"].includes(row.classification)
      ).length,
      bounces: rows.filter((row) => row.classification === "bounce").length,
    },
  });
}
