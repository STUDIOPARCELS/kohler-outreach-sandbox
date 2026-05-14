import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ACTIONABLE = ["positive_reply", "recruiter_screen", "apply_online", "referral", "needs_follow_up"];
const POSITIVE = ["positive_reply", "recruiter_screen", "referral"];

function percent(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function groupCount(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = String(row[key] || "unknown");
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  const [
    { data: sentRows, error: sentError },
    { data: messageRows, error: messagesError },
    { count: threadCount },
    { count: outreachCount },
  ] = await Promise.all([
    supabaseAdmin
      .from("sent_messages")
      .select("id, channel, companyname, contact_email, sent_at, status")
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(500),
    supabaseAdmin
      .from("email_messages")
      .select("id, classification, received_at, from_email, metadata")
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(500),
    supabaseAdmin.from("email_threads").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("reachout_company_inserts")
      .select("*", { count: "exact", head: true })
      .neq("status", "draft")
      .or("emailed_at.not.is.null,sent_at.not.is.null,printed_at.not.is.null"),
  ]);

  if (sentError) return NextResponse.json({ error: sentError.message }, { status: 500 });
  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 });

  const sent = sentRows || [];
  const messages = messageRows || [];
  const replies = messages.filter((row) => row.classification !== "bounce" && row.classification !== "auto_reply" && row.classification !== "out_of_office");
  const actionable = messages.filter((row) => ACTIONABLE.includes(row.classification));
  const positive = messages.filter((row) => POSITIVE.includes(row.classification));
  const bounces = messages.filter((row) => row.classification === "bounce");

  return NextResponse.json({
    cards: {
      outboundSynced: sent.length,
      outreachRowsWithOutboundDates: outreachCount || 0,
      emailSent: sent.filter((row) => row.channel === "email").length,
      lettersSent: sent.filter((row) => row.channel === "letter").length,
      repliesReceived: replies.length,
      actionableReplies: actionable.length,
      positiveReplies: positive.length,
      bounces: bounces.length,
      threads: threadCount || 0,
      responseRate: percent(replies.length, sent.length),
      positiveResponseRate: percent(positive.length, sent.length),
      bounceRate: percent(bounces.length, sent.length),
    },
    byChannel: groupCount(sent, "channel"),
    byClassification: groupCount(messages, "classification"),
    latestReplies: messages.slice(0, 10),
    latestOutbound: sent.slice(0, 10),
  });
}
