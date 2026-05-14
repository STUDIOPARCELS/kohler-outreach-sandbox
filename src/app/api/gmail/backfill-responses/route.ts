import { requireApiSecret } from "@/lib/auth";
import {
  classifyGmailReply,
  extractEmailAddress,
  extractEmailAddresses,
  isActionableReply,
  normalizeEmail,
  pickBestOutreach,
  redactEmail,
  type OutreachHistoryRow,
  type ReplyClassification,
} from "@/lib/gmailResponseBackfill";
import { getAuthedGmailClient } from "@/lib/googleAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { gmail_v1 } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;
const DEFAULT_LIMIT_PER_CONTACT = 10;
const MAX_LIMIT_PER_CONTACT = 25;
const DEFAULT_MAX_CONTACTS = 250;
const MAX_MAX_CONTACTS = 1000;
const MAX_SAMPLE_COUNT = 12;

interface ReplyCandidate {
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  receivedAt: string | null;
  internalDateMs: number | null;
  labelIds: string[];
  headers: Record<string, string>;
  classification: ReplyClassification;
  matchedOutreachId: string | null;
  matchedBy: string | null;
  channel: "email" | "letter" | "unknown";
  companyname: string | null;
  contactEmail: string | null;
  contactName: string | null;
}

interface ThreadAggregate {
  gmail_thread_id: string;
  companyname: string | null;
  contact_email: string | null;
  outreach_id: string | null;
  matched_by: string | null;
  first_message_at: string | null;
  last_message_at: string | null;
  classification: ReplyClassification;
  needs_follow_up: boolean;
  metadata: Record<string, unknown>;
}

function parseBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseDryRun(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return !["false", "0", "no"].includes(value.toLowerCase());
  return true;
}

function headerRecord(message: gmail_v1.Schema$Message): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const header of message.payload?.headers || []) {
    if (header.name) headers[header.name] = header.value || "";
  }
  return headers;
}

function getHeader(headers: Record<string, string>, name: string): string {
  const normalized = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalized) return value;
  }
  return "";
}

function safeSnippet(value: string | null | undefined): string | null {
  const snippet = (value || "").replace(/\s+/g, " ").trim();
  return snippet ? snippet.slice(0, 500) : null;
}

function receivedAtFromMessage(message: gmail_v1.Schema$Message, headers: Record<string, string>): string | null {
  if (message.internalDate) {
    const parsed = Number(message.internalDate);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }

  const headerDate = Date.parse(getHeader(headers, "date"));
  return Number.isFinite(headerDate) ? new Date(headerDate).toISOString() : null;
}

function classificationRank(classification: ReplyClassification): number {
  const rank: Record<ReplyClassification, number> = {
    positive_reply: 100,
    recruiter_screen: 95,
    referral: 90,
    needs_follow_up: 80,
    apply_online: 70,
    rejection: 45,
    bounce: 40,
    out_of_office: 30,
    auto_reply: 20,
    unknown: 0,
  };
  return rank[classification] || 0;
}

function aggregateThreads(candidates: ReplyCandidate[]): ThreadAggregate[] {
  const byThread = new Map<string, ThreadAggregate>();

  for (const candidate of candidates) {
    const existing = byThread.get(candidate.gmailThreadId);
    const receivedAt = candidate.receivedAt;
    const metadata = {
      source: "gmail_backfill",
      channel: candidate.channel,
      sample_message_id: candidate.gmailMessageId,
    };

    if (!existing) {
      byThread.set(candidate.gmailThreadId, {
        gmail_thread_id: candidate.gmailThreadId,
        companyname: candidate.companyname,
        contact_email: candidate.contactEmail,
        outreach_id: candidate.matchedOutreachId,
        matched_by: candidate.matchedBy,
        first_message_at: receivedAt,
        last_message_at: receivedAt,
        classification: candidate.classification,
        needs_follow_up: isActionableReply(candidate.classification),
        metadata,
      });
      continue;
    }

    if (receivedAt && (!existing.first_message_at || receivedAt < existing.first_message_at)) {
      existing.first_message_at = receivedAt;
    }
    if (receivedAt && (!existing.last_message_at || receivedAt > existing.last_message_at)) {
      existing.last_message_at = receivedAt;
    }
    if (classificationRank(candidate.classification) > classificationRank(existing.classification)) {
      existing.classification = candidate.classification;
    }
    existing.needs_follow_up = existing.needs_follow_up || isActionableReply(candidate.classification);
    existing.metadata = { ...existing.metadata, last_message_id: candidate.gmailMessageId };
  }

  return Array.from(byThread.values());
}

async function loadOutreachRows(): Promise<OutreachHistoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from("reachout_company_inserts")
    .select(
      "id, companyname, contactname, contact_email, subject_final, status, emailed_at, sent_at, printed_at, updated_at, job_title, job_url"
    )
    .not("contact_email", "is", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(2000);

  if (error) throw new Error(`Could not load outreach history: ${error.message}`);
  return (data || []) as OutreachHistoryRow[];
}

function indexOutreachByEmail(rows: OutreachHistoryRow[]): Map<string, OutreachHistoryRow[]> {
  const byEmail = new Map<string, OutreachHistoryRow[]>();
  for (const row of rows) {
    const email = normalizeEmail(row.contact_email);
    if (!email) continue;
    const bucket = byEmail.get(email) || [];
    bucket.push(row);
    byEmail.set(email, bucket);
  }
  return byEmail;
}

async function fetchMessageMetadata(gmail: gmail_v1.Gmail, messageId: string): Promise<gmail_v1.Schema$Message> {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: [
      "From",
      "To",
      "Cc",
      "Subject",
      "Date",
      "Message-ID",
      "In-Reply-To",
      "References",
      "Auto-Submitted",
      "Precedence",
    ],
  });
  return response.data;
}

async function scanContactReplies(
  gmail: gmail_v1.Gmail,
  contactEmail: string,
  rows: OutreachHistoryRow[],
  days: number,
  limitPerContact: number
): Promise<ReplyCandidate[]> {
  const q = `from:${contactEmail} newer_than:${days}d -in:chats`;
  const response = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: limitPerContact,
    includeSpamTrash: false,
  });

  const messages = response.data.messages || [];
  const candidates: ReplyCandidate[] = [];
  for (const listed of messages) {
    if (!listed.id) continue;
    const message = await fetchMessageMetadata(gmail, listed.id);
    const headers = headerRecord(message);
    const fromEmail = extractEmailAddress(getHeader(headers, "from"));
    const subject = getHeader(headers, "subject") || null;
    const snippet = safeSnippet(message.snippet);
    const receivedAt = receivedAtFromMessage(message, headers);
    const match = pickBestOutreach(rows, receivedAt, subject);
    const classification = classifyGmailReply({
      fromEmail,
      subject,
      snippet,
      headers,
    });

    candidates.push({
      gmailMessageId: message.id || listed.id,
      gmailThreadId: message.threadId || listed.threadId || listed.id,
      fromEmail,
      toEmails: extractEmailAddresses(`${getHeader(headers, "to")} ${getHeader(headers, "cc")}`),
      subject,
      snippet,
      receivedAt,
      internalDateMs: message.internalDate ? Number(message.internalDate) : null,
      labelIds: message.labelIds || [],
      headers: {
        from: getHeader(headers, "from"),
        to: getHeader(headers, "to"),
        cc: getHeader(headers, "cc"),
        subject: getHeader(headers, "subject"),
        date: getHeader(headers, "date"),
        auto_submitted: getHeader(headers, "auto-submitted"),
        precedence: getHeader(headers, "precedence"),
        message_id: getHeader(headers, "message-id"),
        in_reply_to: getHeader(headers, "in-reply-to"),
      },
      classification,
      matchedOutreachId: match?.row.id || null,
      matchedBy: match?.matchedBy || null,
      channel: match?.channel || "unknown",
      companyname: match?.row.companyname || null,
      contactEmail: contactEmail,
      contactName: match?.row.contactname || null,
    });
  }

  return candidates;
}

function countByClassification(candidates: ReplyCandidate[]): Record<string, number> {
  return candidates.reduce<Record<string, number>>((counts, candidate) => {
    counts[candidate.classification] = (counts[candidate.classification] || 0) + 1;
    return counts;
  }, {});
}

function sampleCandidates(candidates: ReplyCandidate[]) {
  return candidates.slice(0, MAX_SAMPLE_COUNT).map((candidate) => ({
    companyname: candidate.companyname,
    contactEmail: redactEmail(candidate.contactEmail),
    fromEmail: redactEmail(candidate.fromEmail),
    subject: candidate.subject,
    receivedAt: candidate.receivedAt,
    classification: candidate.classification,
    matchedBy: candidate.matchedBy,
    channel: candidate.channel,
    needsFollowUp: isActionableReply(candidate.classification),
  }));
}

function buildSentMessageRows(rows: OutreachHistoryRow[]) {
  return rows.flatMap((row) => {
    const base = {
      outreach_id: row.id,
      source_table: "reachout_company_inserts",
      source_id: row.id,
      companyname: row.companyname,
      contact_email: normalizeEmail(row.contact_email) || null,
      subject: row.subject_final,
      status: row.status,
      metadata: {
        contactname: row.contactname,
        job_title: row.job_title || null,
        job_url: row.job_url || null,
        emailed_at: row.emailed_at,
        sent_at: row.sent_at,
        printed_at: row.printed_at,
      },
    };

    const rowsToWrite = [];
    if (row.emailed_at) {
      rowsToWrite.push({ ...base, channel: "email", sent_at: row.emailed_at });
    }
    if (row.sent_at || row.printed_at) {
      rowsToWrite.push({ ...base, channel: "letter", sent_at: row.sent_at || row.printed_at });
    }
    return rowsToWrite;
  });
}

async function writeBackfill(candidates: ReplyCandidate[], outreachRows: OutreachHistoryRow[]) {
  const sentRows = buildSentMessageRows(outreachRows);
  let sentMessagesUpserted = 0;
  if (sentRows.length > 0) {
    const { error } = await supabaseAdmin
      .from("sent_messages")
      .upsert(sentRows, { onConflict: "source_table,source_id,channel" });
    if (error) throw new Error(`Could not upsert sent_messages: ${error.message}`);
    sentMessagesUpserted = sentRows.length;
  }

  const threadRows = aggregateThreads(candidates);
  const threadIdByGmailId = new Map<string, string>();
  if (threadRows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("email_threads")
      .upsert(threadRows, { onConflict: "gmail_thread_id" })
      .select("id, gmail_thread_id");
    if (error) throw new Error(`Could not upsert email_threads: ${error.message}`);
    for (const row of data || []) {
      if (row.gmail_thread_id && row.id) threadIdByGmailId.set(row.gmail_thread_id, row.id);
    }
  }

  const messageRows = candidates.map((candidate) => ({
    email_thread_id: threadIdByGmailId.get(candidate.gmailThreadId) || null,
    gmail_thread_id: candidate.gmailThreadId,
    gmail_message_id: candidate.gmailMessageId,
    direction: "incoming",
    from_email: candidate.fromEmail,
    to_emails: candidate.toEmails,
    subject: candidate.subject,
    snippet: candidate.snippet,
    received_at: candidate.receivedAt,
    internal_date_ms: candidate.internalDateMs,
    label_ids: candidate.labelIds,
    classification: candidate.classification,
    is_auto_reply: candidate.classification === "out_of_office" || candidate.classification === "auto_reply",
    raw_headers: candidate.headers,
    metadata: {
      source: "gmail_backfill",
      contact_email: candidate.contactEmail,
      contact_name: candidate.contactName,
      companyname: candidate.companyname,
      matched_outreach_id: candidate.matchedOutreachId,
      matched_by: candidate.matchedBy,
      channel: candidate.channel,
    },
  }));

  if (messageRows.length > 0) {
    const { error } = await supabaseAdmin
      .from("email_messages")
      .upsert(messageRows, { onConflict: "gmail_message_id" });
    if (error) throw new Error(`Could not upsert email_messages: ${error.message}`);
  }

  return {
    sentMessagesUpserted,
    emailThreadsUpserted: threadRows.length,
    emailMessagesUpserted: messageRows.length,
  };
}

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const dryRun = parseDryRun(body.dry_run ?? body.dryRun);
  const days = parseBoundedNumber(body.days, DEFAULT_DAYS, 1, MAX_DAYS);
  const limitPerContact = parseBoundedNumber(
    body.limit_per_contact ?? body.limitPerContact,
    DEFAULT_LIMIT_PER_CONTACT,
    1,
    MAX_LIMIT_PER_CONTACT
  );
  const maxContacts = parseBoundedNumber(
    body.max_contacts ?? body.maxContacts,
    DEFAULT_MAX_CONTACTS,
    1,
    MAX_MAX_CONTACTS
  );

  try {
    const outreachRows = await loadOutreachRows();
    const outreachByEmail = indexOutreachByEmail(outreachRows);
    const contactEmails = Array.from(outreachByEmail.keys()).slice(0, maxContacts);
    const { gmail, account } = await getAuthedGmailClient();

    const seenMessages = new Set<string>();
    const candidates: ReplyCandidate[] = [];
    const scanErrors: Array<{ contactEmail: string; error: string }> = [];

    for (const contactEmail of contactEmails) {
      try {
        const found = await scanContactReplies(
          gmail,
          contactEmail,
          outreachByEmail.get(contactEmail) || [],
          days,
          limitPerContact
        );
        for (const candidate of found) {
          if (seenMessages.has(candidate.gmailMessageId)) continue;
          seenMessages.add(candidate.gmailMessageId);
          candidates.push(candidate);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        scanErrors.push({ contactEmail: redactEmail(contactEmail) || "(unknown)", error: message });
      }
    }

    const writeResult = dryRun
      ? { sentMessagesUpserted: 0, emailThreadsUpserted: 0, emailMessagesUpserted: 0 }
      : await writeBackfill(candidates, outreachRows);

    return NextResponse.json({
      dryRun,
      days,
      gmailAccount: redactEmail(account.email),
      outreachRows: outreachRows.length,
      contactEmailsScanned: contactEmails.length,
      limitPerContact,
      candidateReplies: candidates.length,
      actionableReplies: candidates.filter((candidate) => isActionableReply(candidate.classification)).length,
      classificationCounts: countByClassification(candidates),
      writeResult,
      samples: sampleCandidates(candidates),
      scanErrors: scanErrors.slice(0, MAX_SAMPLE_COUNT),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /No Gmail account|invalid_grant|invalid_request|unauthorized/i.test(message) ? 401 : 500;
    return NextResponse.json(
      {
        error: message,
        dryRun,
        days,
        nextStep:
          status === 401
            ? "Reconnect Gmail at /api/google/connect, then retry this route."
            : "Check server logs and retry with dry_run=true first.",
      },
      { status }
    );
  }
}
