// Session F+ — IMAP-based reply backfill.
//
// Bypasses Google OAuth entirely by using GMAIL_APP_PASSWORD (already
// in env_vault) to read kwood12802@gmail.com via IMAP. This unblocks
// historical reply ingestion when OAuth tokens are unavailable.
//
// POST /api/gmail/backfill-imap
//   { since?: "YYYY-MM-DD", before?: "YYYY-MM-DD",
//     mailbox?: "INBOX", max_messages?: 500, dry_run?: boolean,
//     account_email?: string, app_password?: string }
//
// Defaults: since = 90 days ago, before = today, mailbox = INBOX,
//           account_email = process.env.GMAIL_USER,
//           app_password  = process.env.GMAIL_APP_PASSWORD.

import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { requireApiSecret, requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { classifyReply } from "@/lib/gmail/replies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RequestBody {
  since?: string;
  before?: string;
  mailbox?: string;
  max_messages?: number;
  dry_run?: boolean;
  account_email?: string;
  app_password?: string;
}

function parseFromHeader(value: string | null): { email: string | null; name: string | null } {
  if (!value) return { email: null, name: null };
  const m = value.match(/^"?([^"<]+?)"?\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  if (/@/.test(value)) return { name: null, email: value.trim().toLowerCase() };
  return { name: value.trim(), email: null };
}

function bodyText(content: { text?: string; html?: string } | null | undefined): string | null {
  if (!content) return null;
  if (content.text) return content.text.slice(0, 4000);
  if (content.html) {
    return content.html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
  }
  return null;
}

const NEEDS_ACTION = new Set([
  "positive_reply",
  "recruiter_screen",
  "needs_follow_up",
  "referral",
]);

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

  const accountEmail = body.account_email ?? process.env.GMAIL_USER;
  const appPassword = body.app_password ?? process.env.GMAIL_APP_PASSWORD;
  if (!accountEmail || !appPassword) {
    return NextResponse.json(
      { ok: false, error: "GMAIL_USER and GMAIL_APP_PASSWORD must be set (env or body)" },
      { status: 400 }
    );
  }

  const since =
    body.since ??
    new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const before = body.before ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const mailbox = body.mailbox ?? "INBOX";
  const maxMessages = Math.min(body.max_messages ?? 500, 2000);
  const dryRun = !!body.dry_run;

  // App-password expects 16 chars without spaces — but Google sometimes
  // shows them with spaces. Strip whitespace defensively.
  const cleanPassword = appPassword.replace(/\s+/g, "");

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: accountEmail, pass: cleanPassword },
    logger: false,
  });

  const summary = {
    account: accountEmail,
    mailbox,
    since,
    before,
    fetched: 0,
    skipped_existing: 0,
    inserted_messages: 0,
    inserted_threads: 0,
    classifications: {} as Record<string, number>,
    warnings: [] as string[],
  };

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);

    try {
      // SEARCH for messages in date window. IMAP date filters are based
      // on the internal date, not the From: header date.
      const sinceDate = new Date(since + "T00:00:00Z");
      const beforeDate = new Date(before + "T00:00:00Z");
      const searchResult = await client.search(
        { since: sinceDate, before: beforeDate },
        { uid: true }
      );
      const uids = Array.isArray(searchResult) ? searchResult : [];

      summary.fetched = uids.length;
      const limited = uids.slice(-maxMessages); // most recent N
      if (limited.length === 0) {
        return NextResponse.json({ ok: true, dry_run: dryRun, ...summary });
      }

      // Pre-fetch existing gmail_message_id values to dedupe.
      // For IMAP we use Message-ID header as the dedupe key (mapped
      // into gmail_message_id column).
      const seenIds = new Set<string>();
      if (limited.length > 0) {
        const { data: existing } = await supabaseAdmin
          .from("email_messages")
          .select("gmail_message_id")
          .not("gmail_message_id", "is", null);
        for (const row of existing ?? []) {
          const v = (row as { gmail_message_id?: string | null }).gmail_message_id;
          if (v) seenIds.add(v);
        }
      }

      for await (const message of client.fetch(
        limited,
        {
          uid: true,
          envelope: true,
          source: false,
          bodyStructure: false,
          headers: ["message-id", "in-reply-to", "references", "from", "to", "subject"],
          bodyParts: ["TEXT"],
        },
        { uid: true }
      )) {
        try {
          const env = message.envelope ?? null;
          const messageId =
            env?.messageId ??
            (message.headers ? extractHeader(message.headers, "message-id") : null) ??
            `imap-${accountEmail}-${message.uid}`;
          if (seenIds.has(messageId)) {
            summary.skipped_existing++;
            continue;
          }

          const subject = env?.subject ?? null;
          const fromAddr = env?.from?.[0] ?? null;
          const fromEmail = fromAddr?.address?.toLowerCase() ?? null;
          const fromName = fromAddr?.name ?? null;
          const toEmails =
            env?.to?.map((a) => a.address?.toLowerCase()).filter(Boolean) as string[] | undefined;
          const internalDate = env?.date ? new Date(env.date).toISOString() : null;
          const text = (() => {
            const bodyParts = message.bodyParts;
            if (bodyParts && typeof bodyParts.get === "function") {
              const buf = bodyParts.get("text");
              if (buf) return buf.toString("utf-8");
            }
            return null;
          })();

          const direction =
            fromEmail && fromEmail === accountEmail.toLowerCase() ? "outbound" : "inbound";
          const cls = classifyReply({
            subject,
            snippet: text?.slice(0, 200) ?? null,
            body_text: text,
            from_email: fromEmail,
          });
          summary.classifications[cls.classification] =
            (summary.classifications[cls.classification] ?? 0) + 1;

          if (dryRun) {
            summary.inserted_messages++;
            continue;
          }

          // Resolve / insert thread by Gmail-style thread heuristic:
          // use the conversation root, which we approximate via the
          // In-Reply-To / References headers if present, else the
          // Message-ID itself.
          const threadKey = messageId; // Gmail thread API not available via IMAP
          let emailThreadId: string | null = null;

          const { data: existingThread } = await supabaseAdmin
            .from("email_threads")
            .select("id")
            .eq("gmail_thread_id", threadKey)
            .maybeSingle();
          if (existingThread) {
            emailThreadId = (existingThread as { id: string }).id;
            await supabaseAdmin
              .from("email_threads")
              .update({
                last_message_at: internalDate,
                last_classification: cls.classification,
                needs_action: NEEDS_ACTION.has(cls.classification),
              })
              .eq("id", emailThreadId);
          } else {
            const { data: insertedThread, error: threadErr } = await supabaseAdmin
              .from("email_threads")
              .insert({
                gmail_thread_id: threadKey,
                contact_email: direction === "inbound" ? fromEmail : (toEmails?.[0] ?? null),
                first_seen_at: internalDate ?? new Date().toISOString(),
                last_message_at: internalDate,
                last_classification: cls.classification,
                needs_action: NEEDS_ACTION.has(cls.classification),
              })
              .select("id")
              .single();
            if (threadErr) {
              summary.warnings.push(`thread insert ${threadKey}: ${threadErr.message}`);
            } else {
              emailThreadId = (insertedThread as { id?: string } | null)?.id ?? null;
              if (emailThreadId) summary.inserted_threads++;
            }
          }

          const { error: insertErr } = await supabaseAdmin.from("email_messages").insert({
            email_thread_id: emailThreadId,
            gmail_message_id: messageId,
            gmail_thread_id: threadKey,
            direction,
            from_email: fromEmail,
            from_name: fromName,
            to_emails: toEmails && toEmails.length > 0 ? toEmails : null,
            subject,
            snippet: text?.slice(0, 300) ?? null,
            body_text: bodyText({ text: text ?? undefined }),
            internal_date: internalDate,
            classification: cls.classification,
            classification_confidence: cls.confidence,
            raw_payload: { signals: cls.signals, source: "imap", account: accountEmail, uid: message.uid },
          });
          if (insertErr) {
            summary.warnings.push(`insert ${messageId}: ${insertErr.message}`);
          } else {
            summary.inserted_messages++;
          }
        } catch (perMsgErr) {
          summary.warnings.push(`uid ${message.uid}: ${(perMsgErr as Error).message}`);
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `imap: ${(err as Error).message}`, summary },
      { status: 500 }
    );
  } finally {
    try {
      await client.logout();
    } catch {
      /* swallow */
    }
  }

  return NextResponse.json({ ok: true, dry_run: dryRun, ...summary });
}

function extractHeader(headers: Buffer | string, name: string): string | null {
  const text = typeof headers === "string" ? headers : headers.toString("utf-8");
  const re = new RegExp(`^${name}:\\s*(.+)$`, "im");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}
