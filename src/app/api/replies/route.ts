import { requireAppOrigin } from "@/lib/auth";
import { loadBouncedContacts } from "@/lib/bounceSuppression";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface BouncedContact {
  email: string;
  companyname: string | null;
}

interface ReplacementContact {
  contactname: string | null;
  title: string | null;
  email: string | null;
}

function countBy<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = String(row[key] || "unknown");
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function contactPriority(contact: ReplacementContact) {
  const title = (contact.title || "").toLowerCase();
  let score = contact.email ? 10 : 0;
  if (title.includes("engineering manager")) score += 8;
  if (title.includes("director")) score += 7;
  if (title.includes("mechanical")) score += 6;
  if (title.includes("manufacturing")) score += 5;
  if (title.includes("recruiter") || title.includes("talent")) score += 4;
  if (title.includes("sales")) score -= 4;
  return score;
}

async function loadReplacementContacts(bouncedContacts: BouncedContact[]) {
  const companies = Array.from(new Set(bouncedContacts.map((contact) => contact.companyname).filter(Boolean))) as string[];
  if (companies.length === 0) return {};

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("companyname, contactname, title, email")
    .in("companyname", companies)
    .not("email", "is", null)
    .neq("email", "");

  if (error) throw new Error(error.message);

  const bouncedEmailsByCompany = bouncedContacts.reduce<Record<string, Set<string>>>((lookup, contact) => {
    if (!contact.companyname) return lookup;
    lookup[contact.companyname] ||= new Set();
    lookup[contact.companyname].add(contact.email.toLowerCase());
    return lookup;
  }, {});

  return (data || []).reduce<Record<string, ReplacementContact[]>>((lookup, contact) => {
    const company = contact.companyname;
    if (!company || !contact.email) return lookup;
    if (bouncedEmailsByCompany[company]?.has(contact.email.toLowerCase())) return lookup;

    lookup[company] ||= [];
    lookup[company].push({
      contactname: contact.contactname || null,
      title: contact.title || null,
      email: contact.email || null,
    });
    lookup[company].sort((a, b) => contactPriority(b) - contactPriority(a));
    lookup[company] = lookup[company].slice(0, 3);
    return lookup;
  }, {});
}

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 100), 250);

  const [
    { data: messages, error: messagesError },
    { count: sentCount },
    { count: threadCount },
    { data: letterOptions, error: letterOptionsError },
    bouncedContacts,
  ] = await Promise.all([
    supabaseAdmin
      .from("email_messages")
      .select("id, gmail_message_id, gmail_thread_id, direction, from_email, subject, snippet, received_at, classification, is_auto_reply, metadata")
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(limit),
    supabaseAdmin.from("sent_messages").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("email_threads").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("sent_messages")
      .select("id, source_id, outreach_id, companyname, contact_email, subject, sent_at, metadata")
      .eq("channel", "letter")
      .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(250),
    loadBouncedContacts(),
  ]);

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }
  if (letterOptionsError) {
    return NextResponse.json({ error: letterOptionsError.message }, { status: 500 });
  }

  const rows = messages || [];
  let replacementsByCompany: Record<string, ReplacementContact[]> = {};
  try {
    replacementsByCompany = await loadReplacementContacts(bouncedContacts);
  } catch (error) {
    console.error("Replacement contact lookup failed:", error instanceof Error ? error.message : error);
  }

  return NextResponse.json({
    messages: rows,
    letterOptions: letterOptions || [],
    bouncedContacts: bouncedContacts.map((contact) => ({
      ...contact,
      replacementContacts: contact.companyname ? replacementsByCompany[contact.companyname] || [] : [],
    })),
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
