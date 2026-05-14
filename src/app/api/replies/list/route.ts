// Session F — list classified Gmail replies for the /replies page.
//
// GET /api/replies/list?classification=...&needs_action_only=true&limit=...
//
// Reads from email_messages joined to email_threads. Inbound only by
// default. Returns the most recent first.

import { NextRequest, NextResponse } from "next/server";
import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const classification = url.searchParams.get("classification");
  const needsActionOnly = url.searchParams.get("needs_action_only") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  let messagesQuery = supabaseAdmin
    .from("email_messages")
    .select(
      "id, email_thread_id, gmail_message_id, gmail_thread_id, direction, from_email, from_name, subject, snippet, classification, classification_confidence, internal_date"
    )
    .eq("direction", "inbound")
    .order("internal_date", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (classification) {
    messagesQuery = messagesQuery.eq("classification", classification);
  }

  const { data: messages, error } = await messagesQuery;
  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json({
        ok: true,
        count: 0,
        messages: [],
        threads: [],
        breakdown: {},
        warning: "email_messages table missing — apply Session F migration",
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (messages ?? []) as Array<{
    id: string;
    email_thread_id: string | null;
    gmail_message_id: string | null;
    gmail_thread_id: string | null;
    direction: string;
    from_email: string | null;
    from_name: string | null;
    subject: string | null;
    snippet: string | null;
    classification: string | null;
    classification_confidence: number | null;
    internal_date: string | null;
  }>;

  // Hydrate thread metadata (companyname, needs_action) for the rows.
  const threadIds = Array.from(
    new Set(rows.map((r) => r.email_thread_id).filter((id): id is string => !!id))
  );
  const threadMap = new Map<
    string,
    {
      companyname: string | null;
      needs_action: boolean;
      contact_email: string | null;
      last_classification: string | null;
    }
  >();

  if (threadIds.length > 0) {
    const { data: threads } = await supabaseAdmin
      .from("email_threads")
      .select("id, companyname, needs_action, contact_email, last_classification")
      .in("id", threadIds);
    for (const t of (threads ?? []) as Array<{
      id: string;
      companyname: string | null;
      needs_action: boolean | null;
      contact_email: string | null;
      last_classification: string | null;
    }>) {
      threadMap.set(t.id, {
        companyname: t.companyname,
        needs_action: !!t.needs_action,
        contact_email: t.contact_email,
        last_classification: t.last_classification,
      });
    }
  }

  const enriched = rows
    .map((r) => ({
      ...r,
      thread: r.email_thread_id ? threadMap.get(r.email_thread_id) ?? null : null,
    }))
    .filter((r) => (needsActionOnly ? r.thread?.needs_action : true));

  // Classification breakdown (across the unfiltered set) so the page can
  // render a tab-bar with counts per category.
  const breakdown: Record<string, number> = {};
  for (const r of rows) {
    const k = r.classification ?? "unknown";
    breakdown[k] = (breakdown[k] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    count: enriched.length,
    messages: enriched,
    breakdown,
  });
}
