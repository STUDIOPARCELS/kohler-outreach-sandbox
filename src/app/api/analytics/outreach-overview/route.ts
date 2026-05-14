// Session F+ — outreach analytics + cross-reference of outbound vs.
// classified Gmail replies.
//
// GET /api/analytics/outreach-overview
//
// Computes (against live KOHLER OS):
//   1. Outbound funnel from reachout_company_inserts:
//      drafts / letters_sent / emails_sent counts.
//   2. Inbound classification breakdown from email_messages
//      (empty until Gmail backfill runs).
//   3. Per-outbound cross-reference: for each emailed or sent row,
//      finds any reply (from_email = contact_email, internal_date >
//      sent timestamp).
//   4. Response rate + positive response rate.
//   5. Rollup by company tier and niche.
//
// Designed to render meaningful zeros pre-backfill, then light up
// automatically when Gmail data lands.

import { NextRequest, NextResponse } from "next/server";
import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

interface OutboundRow {
  id: string;
  companyname: string;
  contactname: string | null;
  contact_email: string | null;
  status: string | null;
  emailed_at: string | null;
  sent_at: string | null;
  printed_at: string | null;
  created_at: string | null;
  job_title: string | null;
  job_url: string | null;
  followup2_at: string | null;
}

interface InboundRow {
  id: string;
  from_email: string | null;
  internal_date: string | null;
  subject: string | null;
  classification: string | null;
  classification_confidence: number | null;
  email_thread_id: string | null;
  gmail_thread_id: string | null;
}

interface CompanyMeta {
  companyname: string;
  tier: number | null;
  niche: string | null;
  city: string | null;
}

const POSITIVE_CLASSES = new Set([
  "positive_reply",
  "recruiter_screen",
  "referral",
]);

function pickSentTimestamp(row: OutboundRow): {
  channel: "email" | "letter" | "draft";
  sent_at: string | null;
} {
  if (row.emailed_at) return { channel: "email", sent_at: row.emailed_at };
  if (row.sent_at) return { channel: "letter", sent_at: row.sent_at };
  if (row.printed_at) return { channel: "letter", sent_at: row.printed_at };
  return { channel: "draft", sent_at: null };
}

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  // 1. Outbound rows (the 210 reachout_company_inserts).
  const { data: outbound, error: outErr } = await supabaseAdmin
    .from("reachout_company_inserts")
    .select(
      "id, companyname, contactname, contact_email, status, emailed_at, sent_at, printed_at, created_at, job_title, job_url, followup2_at"
    );
  if (outErr) {
    return NextResponse.json({ ok: false, error: outErr.message }, { status: 500 });
  }
  const outboundRows = (outbound ?? []) as OutboundRow[];

  // 2. Inbound rows from email_messages (empty until Gmail backfill).
  let inboundRows: InboundRow[] = [];
  let inboundTableMissing = false;
  {
    const { data, error } = await supabaseAdmin
      .from("email_messages")
      .select(
        "id, from_email, internal_date, subject, classification, classification_confidence, email_thread_id, gmail_thread_id"
      )
      .eq("direction", "inbound");
    if (error) {
      if (/does not exist/i.test(error.message)) {
        inboundTableMissing = true;
      } else {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    } else {
      inboundRows = (data ?? []) as InboundRow[];
    }
  }

  // 3. Companies meta for tier/niche rollups.
  const companynames = Array.from(new Set(outboundRows.map((r) => r.companyname)));
  const companyMetaMap = new Map<string, CompanyMeta>();
  if (companynames.length > 0) {
    const { data: companies } = await supabaseAdmin
      .from("companies")
      .select("companyname, tier, niche, city")
      .in("companyname", companynames);
    for (const c of (companies ?? []) as CompanyMeta[]) {
      companyMetaMap.set(c.companyname, c);
    }
  }

  // 4. Index inbound by lowercase from_email for fast lookup.
  const inboundByEmail = new Map<string, InboundRow[]>();
  for (const m of inboundRows) {
    const key = (m.from_email ?? "").toLowerCase();
    if (!key) continue;
    if (!inboundByEmail.has(key)) inboundByEmail.set(key, []);
    inboundByEmail.get(key)!.push(m);
  }

  // 5. Cross-reference: for each outbound row, find replies whose
  //    from_email equals contact_email and arrived AFTER the send
  //    timestamp. Same domain (not exact email) match handled separately.
  type CrossRow = {
    outbound: OutboundRow;
    channel: "email" | "letter" | "draft";
    sent_at: string | null;
    company: CompanyMeta | null;
    direct_replies: InboundRow[];
    domain_replies: InboundRow[];
  };

  const cross: CrossRow[] = outboundRows.map((row) => {
    const { channel, sent_at } = pickSentTimestamp(row);
    const company = companyMetaMap.get(row.companyname) ?? null;

    let direct_replies: InboundRow[] = [];
    let domain_replies: InboundRow[] = [];

    const contactKey = (row.contact_email ?? "").toLowerCase();
    if (sent_at && contactKey) {
      const sentMs = new Date(sent_at).getTime();

      // Exact email match
      const direct = inboundByEmail.get(contactKey) ?? [];
      direct_replies = direct.filter((r) => {
        if (!r.internal_date) return false;
        return new Date(r.internal_date).getTime() > sentMs;
      });

      // Domain match for less-confident attribution (e.g. someone other
      // than the original contact replies from same domain).
      const domain = contactKey.split("@")[1];
      if (domain) {
        for (const [k, msgs] of Array.from(inboundByEmail.entries())) {
          if (k === contactKey) continue;
          if (k.split("@")[1] !== domain) continue;
          for (const m of msgs) {
            if (!m.internal_date) continue;
            if (new Date(m.internal_date).getTime() > sentMs) domain_replies.push(m);
          }
        }
      }
    }

    return { outbound: row, channel, sent_at, company, direct_replies, domain_replies };
  });

  // 6. Funnel totals.
  const funnel = {
    drafts: cross.filter((c) => c.channel === "draft").length,
    letters_sent: cross.filter((c) => c.channel === "letter").length,
    emails_sent: cross.filter((c) => c.channel === "email").length,
    total_sent: cross.filter((c) => c.channel !== "draft").length,
    inbound_total: inboundRows.length,
    inbound_positive: inboundRows.filter(
      (m) => m.classification && POSITIVE_CLASSES.has(m.classification)
    ).length,
  };

  // 7. Per-channel response rate (only counts outbound that had a sent_at
  //    timestamp + a contact_email; otherwise we can't possibly link).
  function channelStats(channel: "email" | "letter") {
    const sent = cross.filter(
      (c) => c.channel === channel && c.outbound.contact_email && c.sent_at
    );
    const replied = sent.filter(
      (c) => c.direct_replies.length > 0 || c.domain_replies.length > 0
    );
    const positive = sent.filter((c) =>
      [...c.direct_replies, ...c.domain_replies].some(
        (r) => r.classification && POSITIVE_CLASSES.has(r.classification)
      )
    );
    return {
      sent_with_email: sent.length,
      replied: replied.length,
      positive: positive.length,
      response_rate: sent.length > 0 ? replied.length / sent.length : 0,
      positive_response_rate: sent.length > 0 ? positive.length / sent.length : 0,
    };
  }

  const channels = {
    email: channelStats("email"),
    letter: channelStats("letter"),
  };

  // 8. Rollup by company tier (tier 1 = best).
  type Bucket = { sent: number; replied: number; positive: number };
  function bucketKey(c: CrossRow, by: "tier" | "niche"): string {
    if (by === "tier") return c.company?.tier != null ? String(c.company.tier) : "unknown";
    return c.company?.niche ?? "unknown";
  }
  function rollup(by: "tier" | "niche") {
    const map = new Map<string, Bucket>();
    for (const c of cross) {
      if (c.channel === "draft") continue;
      const key = bucketKey(c, by);
      if (!map.has(key)) map.set(key, { sent: 0, replied: 0, positive: 0 });
      const b = map.get(key)!;
      b.sent++;
      const replies = [...c.direct_replies, ...c.domain_replies];
      if (replies.length > 0) b.replied++;
      if (replies.some((r) => r.classification && POSITIVE_CLASSES.has(r.classification))) {
        b.positive++;
      }
    }
    return Array.from(map.entries())
      .map(([key, b]) => ({
        bucket: key,
        sent: b.sent,
        replied: b.replied,
        positive: b.positive,
        response_rate: b.sent > 0 ? Number((b.replied / b.sent).toFixed(3)) : 0,
        positive_response_rate: b.sent > 0 ? Number((b.positive / b.sent).toFixed(3)) : 0,
      }))
      .sort((a, b) => b.sent - a.sent);
  }

  // 9. Inbound classification breakdown.
  const classification_breakdown: Record<string, number> = {};
  for (const m of inboundRows) {
    const k = m.classification ?? "unknown";
    classification_breakdown[k] = (classification_breakdown[k] ?? 0) + 1;
  }

  // 10. Per-outbound rows sorted by status (sent first, then drafts last).
  const sortedCross = [...cross]
    .sort((a, b) => {
      const order = { letter: 0, email: 0, draft: 1 } as Record<string, number>;
      const oa = order[a.channel] ?? 2;
      const ob = order[b.channel] ?? 2;
      if (oa !== ob) return oa - ob;
      const aT = a.sent_at ?? a.outbound.created_at ?? "";
      const bT = b.sent_at ?? b.outbound.created_at ?? "";
      return bT.localeCompare(aT);
    })
    .map((c) => ({
      id: c.outbound.id,
      companyname: c.outbound.companyname,
      tier: c.company?.tier ?? null,
      niche: c.company?.niche ?? null,
      contactname: c.outbound.contactname,
      contact_email: c.outbound.contact_email,
      job_title: c.outbound.job_title,
      job_url: c.outbound.job_url,
      channel: c.channel,
      sent_at: c.sent_at,
      direct_reply_count: c.direct_replies.length,
      domain_reply_count: c.domain_replies.length,
      best_classification:
        [...c.direct_replies, ...c.domain_replies]
          .map((r) => r.classification)
          .find((cls) => cls && POSITIVE_CLASSES.has(cls)) ??
        [...c.direct_replies, ...c.domain_replies][0]?.classification ??
        null,
      latest_reply_at:
        [...c.direct_replies, ...c.domain_replies]
          .map((r) => r.internal_date)
          .filter(Boolean)
          .sort()
          .reverse()[0] ?? null,
    }));

  return NextResponse.json({
    ok: true,
    note:
      inboundTableMissing
        ? "email_messages table missing — apply Session F migration"
        : inboundRows.length === 0
          ? "No Gmail replies imported yet. Run /api/gmail/backfill-responses (production) or POST /api/gmail/sync-incremental to populate."
          : null,
    funnel,
    channels,
    classification_breakdown,
    rollup_by_tier: rollup("tier"),
    rollup_by_niche: rollup("niche"),
    rows: sortedCross,
  });
}
