import { getAuthedGmailClient } from "@/lib/googleAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "googleapis";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── Auth ── */
function checkSecret(req: NextRequest): boolean {
  const secret = process.env.INGEST_SECRET || process.env.IMPORT_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-cron-secret") || req.headers.get("x-import-secret") || "";
  return provided === secret;
}

/* ── Helpers ── */
function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function getBody(payload: gmail_v1.Schema$MessagePart): string {
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html?.body?.data) return decodeBase64Url(html.body.data);
    const text = payload.parts.find((p) => p.mimeType === "text/plain");
    if (text?.body?.data) return decodeBase64Url(text.body.data);
    for (const part of payload.parts) {
      if (part.parts) { const nested = getBody(part); if (nested) return nested; }
    }
  }
  return "";
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function canonicalizeUrl(url: string): string {
  try { const u = new URL(url); return u.origin + u.pathname; } catch { return url; }
}

function normalizeCompanyName(name: string): string {
  return name
    .replace(/\s*,?\s*(Corp\.?|Corporation|Inc\.?|LLC|Ltd\.?|Co\.?|Manufacturing|Services|Industries|Group)$/i, "")
    .trim();
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildExternalJobKey(url: string, company: string, title: string, location: string): string {
  // Try to extract ZipRecruiter job ID from URL
  const idMatch = url.match(/\/(\d{8,})/);
  if (idMatch) return `zr_${idMatch[1]}`;
  // Fallback: hash the tuple
  const input = `${canonicalizeUrl(url)}|${company}|${title}|${location}`.toLowerCase();
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

/* ── Staffing agency blocklist — skip these, they're middlemen not outreach targets ── */
const STAFFING_BLOCKLIST = new Set([
  "cybercoders", "jobot", "insight global", "belcan", "rolinc staffing",
  "executive recruiting", "executive recruiting group", "extensishr",
  "first solutions", "first solutions group", "liberty personnel",
  "liberty personnel services", "matchstick", "point solutions",
  "point solutions group", "epc staff", "epc staff acquisition",
  "robert half", "randstad", "adecco", "manpower", "kelly services",
  "aerotek", "hays", "spherion", "modis", "teksystems", "apex systems",
]);

function isStaffingAgency(company: string): boolean {
  const clean = normalizeCompanyName(company).toLowerCase();
  return STAFFING_BLOCKLIST.has(clean) || 
    STAFFING_BLOCKLIST.has(company.toLowerCase()) ||
    clean.includes("staffing") || clean.includes("recruiting") || clean.includes("personnel");
}

/* ── Email parser ── */
interface ParsedJob {
  title: string;
  companyname: string;
  location: string;
  salary: string;
  job_url: string;
  employment_type: string;
  external_job_key: string;
}

function parseZipRecruiterEmail(subject: string, html: string, messageId: string): ParsedJob[] {
  const jobs: ParsedJob[] = [];
  let title = subject;
  let company = "";

  // Pattern 1: "Title opening at Company"
  let match = subject.match(/^(.+?)\s+opening at\s+(.+)$/i);
  if (match) { title = match[1].trim(); company = match[2].trim(); }

  // Pattern 2: "Company has a Title opening now"
  if (!company) {
    match = subject.match(/^(.+?)\s+has an?\s+(.+?)\s+opening\s+now$/i);
    if (match) { company = match[1].trim(); title = match[2].trim(); }
  }

  // Pattern 3: "Lisa, Company has an open position"
  if (!company && subject.toLowerCase().includes("has an open position")) {
    match = subject.match(/^[^,]+,\s*(.+?)\s+has an open position$/i);
    if (match) { company = match[1].trim(); title = "Open Position"; }
  }

  // Pattern 4: "Lisa, new Title jobs near you"
  if (!company && subject.toLowerCase().includes("jobs near you")) {
    match = subject.match(/^[^,]+,\s*new\s+(.+?)\s+jobs near you$/i);
    if (match) { title = match[1].trim(); company = "Multiple"; }
  }

  // Pattern 5: "Lisa, Company is hiring a Title"
  if (!company) {
    match = subject.match(/^[^,]*,\s*(.+?)\s+is hiring an?\s+(.+)$/i);
    if (match) { company = match[1].trim(); title = match[2].trim(); }
  }

  // Extract URLs
  const urlRegex = /href=["'](https?:\/\/[^"']*ziprecruiter\.com\/[^"']*?)["']/gi;
  const urls: string[] = [];
  let urlM: RegExpExecArray | null;
  while ((urlM = urlRegex.exec(html)) !== null) {
    const url = urlM[1];
    if (url.includes("unsubscribe") || url.includes("privacy") || url.includes("terms") || url.includes(".png") || url.includes(".jpg") || url.includes("optout")) continue;
    urls.push(url);
  }

  // Extract salary
  let salary = "";
  const salaryMatch = html.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*(?:per|\/|a)\s*(?:year|hour|hr|annum))?/i);
  if (salaryMatch) salary = salaryMatch[0];

  // Build job row
  if (title && company && company !== "Multiple") {
    const url = urls[0] || "https://www.ziprecruiter.com";
    const key = buildExternalJobKey(url, company, title, "Denver metro");
    jobs.push({
      title,
      companyname: company,
      location: "Denver metro area",
      salary,
      job_url: url,
      employment_type: "",
      external_job_key: key,
    });
  }

  // Multi-job emails: extract individual links
  if (company === "Multiple" && urls.length > 1) {
    const blockRegex = /<a[^>]*href=["']([^"']*ziprecruiter\.com[^"']*?)["'][^>]*>([^<]*)</gi;
    let blockM: RegExpExecArray | null;
    while ((blockM = blockRegex.exec(html)) !== null) {
      const blockUrl = blockM[1];
      const linkText = blockM[2].trim();
      if (linkText.length > 5) {
        const key = buildExternalJobKey(blockUrl, linkText, linkText, "Denver metro");
        jobs.push({
          title: linkText,
          companyname: "See listing",
          location: "Denver metro area",
          salary,
          job_url: blockUrl,
          employment_type: "",
          external_job_key: key,
        });
      }
    }
  }

  return jobs;
}

/* ── Company matching ── */
interface CompanyRow { id: number; name: string; lower: string; }

function matchCompanyInMemory(jobCompany: string, companyList: CompanyRow[]): CompanyRow | null {
  const clean = normalizeCompanyName(jobCompany).toLowerCase();

  // Exact
  const exact = companyList.find((c) => c.lower === clean || c.lower === jobCompany.toLowerCase());
  if (exact) return exact;

  // Forward: existing contains clean
  const forward = companyList.find((c) => c.lower.includes(clean) && clean.length >= 4);
  if (forward) return forward;

  // Reverse: clean contains existing
  const reverse = companyList.filter((c) => c.lower.length >= 4 && clean.includes(c.lower)).sort((a, b) => b.lower.length - a.lower.length);
  if (reverse.length > 0) return reverse[0];

  return null;
}

/* ── Main handler ── */
export async function POST(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: run } = await supabaseAdmin.from("job_ingest_runs").insert({ status: "running" }).select("id").single();
  const runId = run?.id;
  let messagesSeen = 0;
  let jobsExtracted = 0;
  let companiesCreated = 0;

  try {
    const { gmail, account } = await getAuthedGmailClient();

    // Pre-load companies
    const { data: allCompanies } = await supabaseAdmin.from("companies").select("id, companyname");
    const companyList: CompanyRow[] = (allCompanies || []).map((c) => ({ id: c.id, name: c.companyname, lower: c.companyname.toLowerCase() }));

    // Pre-load processed message IDs from job_listings
    const { data: processed } = await supabaseAdmin.from("job_listings").select("gmail_message_id").not("gmail_message_id", "is", null);
    const processedSet = new Set((processed || []).map((p) => p.gmail_message_id));

    // Get message IDs
    let messageIds: string[] = [];

    if (account.last_history_id) {
      try {
        const history = await gmail.users.history.list({
          userId: "me",
          startHistoryId: account.last_history_id,
          historyTypes: ["messageAdded"],
          labelId: account.label_id || undefined,
        });
        const added = history.data.history?.flatMap((h) => h.messagesAdded?.map((m) => m.message?.id).filter(Boolean) || []) || [];
        messageIds = added.filter((id): id is string => !!id);
        if (history.data.historyId) {
          await supabaseAdmin.from("gmail_accounts").update({ last_history_id: history.data.historyId, updated_at: new Date().toISOString() }).eq("id", account.id);
        }
      } catch (err: unknown) {
        if ((err as { code?: number })?.code === 404) { account.last_history_id = null; }
        else throw err;
      }
    }

    if (!account.last_history_id) {
      const list = await gmail.users.messages.list({
        userId: "me", maxResults: 100,
        q: account.label_id ? undefined : "from:alerts@ziprecruiter.com",
        labelIds: account.label_id ? [account.label_id] : undefined,
      });
      messageIds = list.data.messages?.map((m) => m.id).filter((id): id is string => !!id) || [];
      if (messageIds.length > 0) {
        const firstMsg = await gmail.users.messages.get({ userId: "me", id: messageIds[0], format: "METADATA" });
        if (firstMsg.data.historyId) {
          await supabaseAdmin.from("gmail_accounts").update({ last_history_id: firstMsg.data.historyId, updated_at: new Date().toISOString() }).eq("id", account.id);
        }
      }
    }

    messagesSeen = messageIds.length;

    for (const msgId of messageIds) {
      try {
        if (processedSet.has(msgId)) continue;

        const msg = await gmail.users.messages.get({ userId: "me", id: msgId, format: "full" });
        const payload = msg.data.payload;
        if (!payload) continue;

        const subject = getHeader(payload.headers, "Subject");
        const from = getHeader(payload.headers, "From");
        const dateStr = getHeader(payload.headers, "Date");

        if (!from.toLowerCase().includes("ziprecruiter")) continue;

        const html = getBody(payload);
        const parsedJobs = parseZipRecruiterEmail(subject, html, msgId);

        for (const job of parsedJobs) {
          // Skip staffing agencies
          if (isStaffingAgency(job.companyname)) continue;

          // Match or create company
          let matched = matchCompanyInMemory(job.companyname, companyList);
          let companyId: number | null = matched?.id || null;
          const canonicalName = matched?.name || normalizeCompanyName(job.companyname);

          if (!matched && job.companyname !== "See listing" && job.companyname !== "Multiple") {
            // Create new company
            const { data: newCo } = await supabaseAdmin.from("companies").insert({
              companyname: canonicalName,
              company_key: slugify(canonicalName),
              city: "Denver",
              tier: 4,
              niche: "ZipRecruiter Intake",
              company_about: `Added from ZipRecruiter ingest. Job: ${job.title}`,
            }).select("id, companyname").single();

            if (newCo) {
              companyId = newCo.id;
              companyList.push({ id: newCo.id, name: newCo.companyname, lower: newCo.companyname.toLowerCase() });
              companiesCreated++;
            }
          }

          // Upsert into job_listings
          const { error: upsertErr } = await supabaseAdmin.from("job_listings").upsert({
            companyname: matched?.name || canonicalName,
            company_id: companyId,
            title: job.title,
            salary: job.salary || null,
            location: job.location || null,
            employment_type: job.employment_type || null,
            source: "ziprecruiter_email",
            external_job_key: job.external_job_key,
            gmail_message_id: msgId,
            job_url: canonicalizeUrl(job.job_url),
            received_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
            raw_payload: { parserVersion: 2, subject, from, messageId: msgId, parsedJob: job },
            ingest_status: "new",
            parser_version: 2,
          }, { onConflict: "source,external_job_key" });

          if (!upsertErr) jobsExtracted++;
        }
      } catch (msgErr) {
        console.error(`Error processing message ${msgId}:`, msgErr);
      }
    }

    if (runId) {
      await supabaseAdmin.from("job_ingest_runs").update({
        finished_at: new Date().toISOString(), messages_seen: messagesSeen,
        jobs_extracted: jobsExtracted, companies_created: companiesCreated, status: "completed",
      }).eq("id", runId);
    }

    return NextResponse.json({ success: true, messages_seen: messagesSeen, jobs_extracted: jobsExtracted, companies_created: companiesCreated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Ingest error:", message);
    if (runId) {
      await supabaseAdmin.from("job_ingest_runs").update({ finished_at: new Date().toISOString(), status: "error", error_text: message }).eq("id", runId);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
