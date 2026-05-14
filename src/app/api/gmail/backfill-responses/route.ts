// Phase 9 — POST /api/gmail/backfill-responses
//   { start_date?, end_date?, candidate_email?, query?, max_messages?, dry_run? }
//
// Pulls historical Gmail messages in the given window, classifies them,
// links them to outreach_actions when possible (by recipient or thread),
// and writes email_threads + email_messages rows. Idempotent: messages
// already stored by gmail_message_id are skipped.

import { NextRequest, NextResponse } from "next/server";
import { requireApiSecret, requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthedGmailClient } from "@/lib/googleAuth";
import { classifyReply } from "@/lib/gmail/replies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RequestBody {
  start_date?: string;
  end_date?: string;
  candidate_email?: string;
  query?: string;
  max_messages?: number;
  dry_run?: boolean;
}

interface GmailHeader {
  name?: string | null;
  value?: string | null;
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const found = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value ?? null;
}

function parseFromHeader(value: string | null): { email: string | null; name: string | null } {
  if (!value) return { email: null, name: null };
  const m = value.match(/^"?([^"<]+?)"?\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  if (/@/.test(value)) return { name: null, email: value.trim() };
  return { name: value.trim(), email: null };
}

export async function POST(req: NextRequest) {
  const apiAuth = requireApiSecret(req);
  if (apiAuth) {
    const originAuth = requireAppOrigin(req);
    if (originAuth) return originAuth;
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    /* allow empty */
  }

  const max = Math.min(body.max_messages ?? 50, 200);
  const dryRun = !!body.dry_run;

  let queryParts: string[] = [];
  if (body.start_date) queryParts.push(`after:${body.start_date}`);
  if (body.end_date) queryParts.push(`before:${body.end_date}`);
  if (body.candidate_email) queryParts.push(`(from:${body.candidate_email} OR to:${body.candidate_email})`);
  if (body.query) queryParts.push(body.query);
  // Default scope: inbox replies (excluding ATS automated drips by default).
  if (queryParts.length === 0) queryParts.push("in:inbox newer_than:90d");
  const q = queryParts.join(" ");

  let gmail: Awaited<ReturnType<typeof getAuthedGmailClient>>["gmail"];
  try {
    const authed = await getAuthedGmailClient();
    gmail = authed.gmail;
  } catch (err) {
    return NextResponse.json({ ok: false, error: `gmail auth: ${(err as Error).message}` }, { status: 500 });
  }

  const list = await gmail.users.messages.list({ userId: "me", q, maxResults: max });
  const ids = (list.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => !!id);

  const seenIds = new Set<string>();
  if (ids.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from("email_messages")
      .select("gmail_message_id")
      .in("gmail_message_id", ids);
    for (const row of existing ?? []) {
      const v = (row as { gmail_message_id?: string | null }).gmail_message_id;
      if (v) seenIds.add(v);
    }
  }

  const summary = {
    fetched: ids.length,
    skipped_existing: 0,
    inserted_messages: 0,
    inserted_threads: 0,
    classifications: {} as Record<string, number>,
    warnings: [] as string[],
  };

  for (const msgId of ids) {
    if (seenIds.has(msgId)) {
      summary.skipped_existing++;
      continue;
    }
    try {
      const msg = await gmail.users.messages.get({ userId: "me", id: msgId, format: "full" });
      const payload = msg.data.payload;
      const subject = getHeader(payload?.headers ?? undefined, "Subject");
      const fromHeader = getHeader(payload?.headers ?? undefined, "From");
      const toHeader = getHeader(payload?.headers ?? undefined, "To");
      const { email: fromEmail, name: fromName } = parseFromHeader(fromHeader);
      const internalDate = msg.data.internalDate
        ? new Date(Number(msg.data.internalDate)).toISOString()
        : null;
      const snippet = msg.data.snippet ?? null;
      const direction =
        body.candidate_email && fromEmail && fromEmail.toLowerCase() === body.candidate_email.toLowerCase()
          ? "outbound"
          : "inbound";
      const cls = classifyReply({ subject, snippet, body_text: snippet, from_email: fromEmail });
      summary.classifications[cls.classification] = (summary.classifications[cls.classification] ?? 0) + 1;

      if (dryRun) {
        summary.inserted_messages++;
        continue;
      }

      // Resolve / insert thread.
      const threadId = msg.data.threadId ?? null;
      let emailThreadId: number | null = null;
      if (threadId) {
        const { data: existingThread } = await supabaseAdmin
          .from("email_threads")
          .select("id")
          .eq("gmail_thread_id", threadId)
          .maybeSingle();
        if (existingThread) {
          emailThreadId = (existingThread as { id: number }).id;
          await supabaseAdmin
            .from("email_threads")
            .update({
              last_message_at: internalDate,
              last_classification: cls.classification,
              needs_action:
                ["positive_reply", "recruiter_screen", "needs_follow_up", "referral"].includes(cls.classification),
            })
            .eq("id", emailThreadId);
        } else {
          // Try to link to an outreach action by gmail_thread_id on email_drafts.
          const { data: linkedDraft } = await supabaseAdmin
            .from("email_drafts")
            .select("outreach_action_id, to_email")
            .eq("gmail_thread_id", threadId)
            .maybeSingle();
          const outreachActionId = (linkedDraft as { outreach_action_id?: number | null } | null)?.outreach_action_id ?? null;

          const { data: insertedThread } = await supabaseAdmin
            .from("email_threads")
            .insert({
              gmail_thread_id: threadId,
              contact_email: fromEmail,
              outreach_action_id: outreachActionId,
              first_seen_at: internalDate ?? new Date().toISOString(),
              last_message_at: internalDate,
              last_classification: cls.classification,
              needs_action:
                ["positive_reply", "recruiter_screen", "needs_follow_up", "referral"].includes(cls.classification),
            })
            .select("id")
            .single();
          emailThreadId = (insertedThread as { id?: number } | null)?.id ?? null;
          if (emailThreadId) summary.inserted_threads++;
        }
      }

      const { error: insertErr } = await supabaseAdmin.from("email_messages").insert({
        email_thread_id: emailThreadId,
        gmail_message_id: msgId,
        gmail_thread_id: threadId,
        direction,
        from_email: fromEmail,
        from_name: fromName,
        to_emails: toHeader ? [toHeader] : null,
        subject,
        snippet,
        body_text: snippet,
        internal_date: internalDate,
        classification: cls.classification,
        classification_confidence: cls.confidence,
        raw_payload: { signals: cls.signals },
      });
      if (insertErr) {
        summary.warnings.push(`insert ${msgId}: ${insertErr.message}`);
        if (/does not exist/i.test(insertErr.message)) {
          summary.warnings.push("email_messages table missing — apply supabase/migrations/0005_email_messages.sql");
          break;
        }
      } else {
        summary.inserted_messages++;
      }
    } catch (err) {
      summary.warnings.push(`${msgId}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, dry_run: dryRun, query: q, ...summary });
}
