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

  const showNoise = url.searchParams.get("include_noise") === "true";

  // Common noise patterns: marketing/notification/job-board senders
  // that are not real outreach responses. Default-hidden; pass
  // ?include_noise=true to see them.
  // Sender patterns that almost always indicate non-outreach noise
  // (marketing, automation, transactional). Conservative — false
  // negatives (real reply hidden) are worse than false positives
  // (noise leaking through), so each pattern targets known offenders.
  const NOISE_PATTERNS = [
    // Standard automation prefixes
    "noreply@",
    "no-reply@",
    "donotreply@",
    "do-not-reply@",
    "postmaster@",
    "mailer-daemon@",
    "alerts@",
    "newsletter@",
    "marketing@",
    "info@hire",
    "reply_ok@",
    // ATS / job-board automation
    "@linkedin.com",
    "@indeed.com",
    "@glassdoor.com",
    "@dice.com",
    "@ziprecruiter.com",
    "@email.ihire.com",
    "@alerts.jobot.com",
    "@echo.newtonsoftware.com",
    "@notify.greenhouse.io",
    "@notify.lever.co",
    "@accounts.google.com",
    // Marketing email subdomains
    "@em.",
    "@email.",
    "@mail.",
    "@e.",
    "@notification.",
    "@notifications.",
    "@mg.",
    "@updates.",
    "@news.",
    // Specific retail / consumer noise observed in inbox
    "@robinhood.com",
    "@officedepot.com",
    "@worldmarket.com",
    "@nordstrom.com",
    "@christysports.com",
    "@uber.com",
    "@walgreens.com",
    "@imdb.com",
    "@redditmail.com",
    "@notification.capitalone.com",
    "@em.officedepot.com",
  ];

  let messagesQuery = supabaseAdmin
    .from("email_messages")
    .select(
      "id, email_thread_id, gmail_message_id, gmail_thread_id, direction, from_email, from_name, subject, snippet, classification, classification_confidence, internal_date"
    )
    .eq("direction", "inbound")
    .order("internal_date", { ascending: false, nullsFirst: false })
    .limit(showNoise ? limit : Math.min(limit * 5, 1000));

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

  function isNoise(fromEmail: string | null): boolean {
    if (!fromEmail) return false;
    const lower = fromEmail.toLowerCase();
    return NOISE_PATTERNS.some((p) => lower.includes(p));
  }

  // Sender domains that scream "marketing list" — hide ALWAYS, even
  // when the classifier mislabels them as bounce/rejection.
  const HARD_NOISE_DOMAIN_FRAGMENTS = [
    "@e.",
    "@em.",
    "@email.",
    "@mail.",
    "@news.",
    "@updates.",
    "@notifications.",
    "@notification.",
    "@em",
    "@redditmail.com",
    "@robinhood.com",
    "@uber.com",
    "@walgreens.com",
    "@imdb.com",
    "@officedepot.com",
    "@worldmarket.com",
    "@nordstrom.com",
    "@christysports.com",
    "@invitations.linkedin.com",
    "@linkedin.com",
    "@accounts.google.com",
  ];
  function isHardNoise(fromEmail: string | null): boolean {
    if (!fromEmail) return false;
    const lower = fromEmail.toLowerCase();
    return HARD_NOISE_DOMAIN_FRAGMENTS.some((p) => lower.includes(p));
  }

  // Classifications where the sender's automation status doesn't matter
  // (a real bounce IS a bounce regardless of being from postmaster@) —
  // BUT marketing-list senders are still always hidden via isHardNoise.
  const ALWAYS_SHOW_UNLESS_HARD_NOISE = new Set([
    "bounce",
    "rejection",
    "out_of_office",
    "auto_reply",
  ]);

  const enriched = rows
    .map((r) => ({
      ...r,
      is_noise: isNoise(r.from_email),
      thread: r.email_thread_id ? threadMap.get(r.email_thread_id) ?? null : null,
    }))
    .filter((r) => {
      const cls = r.classification ?? "unknown";
      const hardNoise = isHardNoise(r.from_email);
      const exemptFromSoftNoise = ALWAYS_SHOW_UNLESS_HARD_NOISE.has(cls);
      // Hard noise is always filtered (unless include_noise=true)
      if (!showNoise && hardNoise) return false;
      // Soft noise is filtered EXCEPT for the always-show classifications
      if (!showNoise && r.is_noise && !exemptFromSoftNoise) return false;
      if (needsActionOnly && !r.thread?.needs_action) return false;
      return true;
    })
    .slice(0, limit);

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
