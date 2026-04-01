import { getAuthedGmailClient } from "@/lib/googleAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "googleapis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── Auth ── */
function checkSecret(req: NextRequest): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return false;
  const provided =
    req.headers.get("x-cron-secret") ||
    req.headers.get("x-import-secret") ||
    "";
  return provided === secret;
}

/* ── Email parser ── */
interface ParsedJob {
  title: string;
  company_name: string;
  location_text: string;
  job_url: string;
  salary_text: string;
  external_job_key: string;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function getBody(payload: gmail_v1.Schema$MessagePart): string {
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    // Prefer HTML
    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html?.body?.data) return decodeBase64Url(html.body.data);
    // Fallback to text
    const text = payload.parts.find((p) => p.mimeType === "text/plain");
    if (text?.body?.data) return decodeBase64Url(text.body.data);
    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = getBody(part);
        if (nested) return nested;
      }
    }
  }
  return "";
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function stripTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    // Keep only the path as the key — tracking params vary per email
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

function parseZipRecruiterEmail(subject: string, html: string, messageId: string): ParsedJob[] {
  const jobs: ParsedJob[] = [];
  let title = subject;
  let company = "";

  // Pattern 1: "Mechanical Engineer I opening at CONMED"
  let match = subject.match(/^(.+?)\s+opening at\s+(.+)$/i);
  if (match) {
    title = match[1].trim();
    company = match[2].trim();
  }

  // Pattern 2: "Harley Ellis Devereaux has a Mechanical Engineer - Mission Critical opening now"
  if (!company) {
    match = subject.match(/^(.+?)\s+has an?\s+(.+?)\s+opening\s+now$/i);
    if (match) {
      company = match[1].trim();
      title = match[2].trim();
    }
  }

  // Pattern 3: "Lisa, AECOM has an open position"
  if (!company && subject.toLowerCase().includes("has an open position")) {
    match = subject.match(/^[^,]+,\s*(.+?)\s+has an open position$/i);
    if (match) {
      company = match[1].trim();
      title = "Open Position";
    }
  }

  // Pattern 4: "Lisa, new Mechanical Engineer jobs near you"
  if (!company && subject.toLowerCase().includes("jobs near you")) {
    match = subject.match(/^[^,]+,\s*new\s+(.+?)\s+jobs near you$/i);
    if (match) {
      title = match[1].trim();
      company = "Multiple";
    }
  }

  // Pattern 5: "Lisa, X is hiring a Y"
  if (!company) {
    match = subject.match(/^[^,]*,\s*(.+?)\s+is hiring an?\s+(.+)$/i);
    if (match) {
      company = match[1].trim();
      title = match[2].trim();
    }
  }

  // Extract all ZipRecruiter URLs from HTML (accept any ziprecruiter.com link)
  const urlRegex = /href=["'](https?:\/\/[^"']*ziprecruiter\.com\/[^"']*?)["']/gi;
  const urls: string[] = [];
  let urlM: RegExpExecArray | null;
  while ((urlM = urlRegex.exec(html)) !== null) {
    const url = urlM[1];
    // Skip unsubscribe, privacy, terms, and logo/image links
    if (
      url.includes("unsubscribe") ||
      url.includes("privacy") ||
      url.includes("terms") ||
      url.includes(".png") ||
      url.includes(".jpg") ||
      url.includes("optout")
    ) continue;
    urls.push(url);
  }

  // Extract salary if present
  let salary = "";
  const salaryMatch = html.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*(?:per|\/|a)\s*(?:year|hour|hr|annum))?/i);
  if (salaryMatch) salary = salaryMatch[0];

  // If we found multiple job URLs, each is likely a separate job listing in an aggregate email
  if (urls.length > 1 && company === "Multiple") {
    // Try to extract individual job titles + companies from the HTML
    const blockRegex = /<a[^>]*href=["']([^"']*ziprecruiter\.com[^"']*?)["'][^>]*>([^<]*)</gi;
    let blockM: RegExpExecArray | null;
    while ((blockM = blockRegex.exec(html)) !== null) {
      const blockUrl = blockM[1];
      const linkText = blockM[2].trim();
      if (linkText.length > 5 && (blockUrl.includes("/job/") || blockUrl.includes("/k/"))) {
        jobs.push({
          title: linkText,
          company_name: "See listing",
          location_text: "Denver metro area (80226)",
          job_url: blockUrl,
          salary_text: salary,
          external_job_key: `${messageId}::${linkText}`.toLowerCase(),
        });
      }
    }
  }

  // If no individual jobs parsed, create one from the subject line
  if (jobs.length === 0 && title && company) {
    const url = urls[0] || "https://www.ziprecruiter.com";
    jobs.push({
      title,
      company_name: company,
      location_text: "Denver metro area (80226)",
      job_url: url,
      salary_text: salary,
      external_job_key: `${messageId}::${company}::${title}`.toLowerCase(),
    });
  }

  return jobs;
}

/* ── Main ingest handler ── */
export async function POST(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Create ingest run record
  const { data: run } = await supabaseAdmin
    .from("job_ingest_runs")
    .insert({ status: "running" })
    .select("id")
    .single();

  const runId = run?.id;
  let messagesSeen = 0;
  let jobsExtracted = 0;
  let companiesCreated = 0;

  try {
    const { gmail, account } = await getAuthedGmailClient();

    let messageIds: string[] = [];

    if (account.last_history_id) {
      // Incremental sync
      try {
        const history = await gmail.users.history.list({
          userId: "me",
          startHistoryId: account.last_history_id,
          historyTypes: ["messageAdded"],
          labelId: account.label_id || undefined,
        });

        const added = history.data.history?.flatMap(
          (h) => h.messagesAdded?.map((m) => m.message?.id).filter(Boolean) || []
        ) || [];
        messageIds = added.filter((id): id is string => !!id);

        // Update historyId
        if (history.data.historyId) {
          await supabaseAdmin
            .from("gmail_accounts")
            .update({ last_history_id: history.data.historyId, updated_at: new Date().toISOString() })
            .eq("id", account.id);
        }
      } catch (err: unknown) {
        // 404 = historyId expired, do full sync
        const status = (err as { code?: number })?.code;
        if (status === 404) {
          account.last_history_id = null;
        } else {
          throw err;
        }
      }
    }

    if (!account.last_history_id) {
      // Full sync — get recent ZipRecruiter emails
      const query = account.label_id
        ? undefined
        : "from:alerts@ziprecruiter.com";
      const list = await gmail.users.messages.list({
        userId: "me",
        maxResults: 100,
        q: query,
        labelIds: account.label_id ? [account.label_id] : undefined,
      });

      messageIds = list.data.messages?.map((m) => m.id).filter((id): id is string => !!id) || [];

      // Save historyId for future incremental syncs
      if (list.data.resultSizeEstimate && messageIds.length > 0) {
        const firstMsg = await gmail.users.messages.get({ userId: "me", id: messageIds[0], format: "METADATA" });
        if (firstMsg.data.historyId) {
          await supabaseAdmin
            .from("gmail_accounts")
            .update({ last_history_id: firstMsg.data.historyId, updated_at: new Date().toISOString() })
            .eq("id", account.id);
        }
      }
    }

    messagesSeen = messageIds.length;

    // Pre-load all companies for fast in-memory matching
    const { data: allCompanies } = await supabaseAdmin
      .from("companies")
      .select("id, companyname");
    const companyList = (allCompanies || []).map((c) => ({
      id: c.id,
      name: c.companyname,
      lower: c.companyname.toLowerCase(),
    }));

    // Pre-load already-processed message IDs
    const { data: processed } = await supabaseAdmin
      .from("job_positions")
      .select("gmail_message_id");
    const processedSet = new Set((processed || []).map((p) => p.gmail_message_id));

    // In-memory company matcher
    const matchCompany = (jobCompany: string): number | null => {
      const clean = jobCompany
        .replace(/\s*,?\s*(Corp\.?|Corporation|Inc\.?|LLC|Ltd\.?|Co\.?|Manufacturing|Services|Industries)$/i, "")
        .trim()
        .toLowerCase();

      // Exact match
      const exact = companyList.find((c) => c.lower === clean || c.lower === jobCompany.toLowerCase());
      if (exact) return exact.id;

      // Existing name contains clean job name
      const forward = companyList.find((c) => c.lower.includes(clean) && clean.length >= 4);
      if (forward) return forward.id;

      // Job name contains existing company name (reverse)
      const reverse = companyList
        .filter((c) => c.lower.length >= 4 && clean.includes(c.lower))
        .sort((a, b) => b.lower.length - a.lower.length);
      if (reverse.length > 0) return reverse[0].id;

      return null;
    }

    // Process each message
    for (const msgId of messageIds) {
      try {
        if (processedSet.has(msgId)) continue;

        const msg = await gmail.users.messages.get({ userId: "me", id: msgId, format: "full" });
        const payload = msg.data.payload;
        if (!payload) continue;

        const subject = getHeader(payload.headers, "Subject");
        const from = getHeader(payload.headers, "From");
        const dateStr = getHeader(payload.headers, "Date");

        // Only process ZipRecruiter emails
        if (!from.toLowerCase().includes("ziprecruiter")) continue;

        const html = getBody(payload);
        const parsedJobs = parseZipRecruiterEmail(subject, html, msgId);

        for (const job of parsedJobs) {
          // Match company in memory
          const companyId = matchCompany(job.company_name);

          // Upsert job position
          const { error: upsertErr } = await supabaseAdmin
            .from("job_positions")
            .upsert(
              {
                source: "ziprecruiter_email",
                external_job_key: job.external_job_key,
                gmail_message_id: msgId,
                company_id: companyId,
                company_name: job.company_name,
                title: job.title,
                location_text: job.location_text,
                job_url: job.job_url,
                salary_text: job.salary_text,
                zip_code: "80226",
                radius_miles: 30,
                received_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
                source_payload: { subject, from, messageId: msgId },
                parser_version: 1,
                outreach_state: "new",
              },
              { onConflict: "source,external_job_key" }
            );

          if (!upsertErr) jobsExtracted++;
        }
      } catch (msgErr) {
        console.error(`Error processing message ${msgId}:`, msgErr);
      }
    }

    // Complete the run
    if (runId) {
      await supabaseAdmin
        .from("job_ingest_runs")
        .update({
          finished_at: new Date().toISOString(),
          messages_seen: messagesSeen,
          jobs_extracted: jobsExtracted,
          companies_created: companiesCreated,
          status: "completed",
        })
        .eq("id", runId);
    }

    return NextResponse.json({
      success: true,
      messages_seen: messagesSeen,
      jobs_extracted: jobsExtracted,
      companies_created: companiesCreated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Ingest error:", message);

    if (runId) {
      await supabaseAdmin
        .from("job_ingest_runs")
        .update({ finished_at: new Date().toISOString(), status: "error", error_text: message })
        .eq("id", runId);
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
