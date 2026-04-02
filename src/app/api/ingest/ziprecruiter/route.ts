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

function getTextBody(payload: gmail_v1.Schema$MessagePart): string {
  if (payload.parts) {
    const text = payload.parts.find((p) => p.mimeType === "text/plain");
    if (text?.body?.data) return decodeBase64Url(text.body.data);
    for (const part of payload.parts) {
      if (part.parts) { const nested = getTextBody(part); if (nested) return nested; }
    }
  }
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
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

/* ── Build external key for government jobs — uses the NEOGOV job ID ── */
function buildGovJobKey(jobId: string): string {
  return `gov_${jobId}`;
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

/* ── Source detection ── */
type EmailSource = "ziprecruiter" | "governmentjobs" | "unknown";

function detectSource(from: string): EmailSource {
  const lower = from.toLowerCase();
  if (lower.includes("ziprecruiter")) return "ziprecruiter";
  if (lower.includes("governmentjobs") || lower.includes("neogov")) return "governmentjobs";
  return "unknown";
}

/* ── Shared job interface ── */
interface ParsedJob {
  title: string;
  companyname: string;
  location: string;
  salary: string;
  job_url: string;
  employment_type: string;
  external_job_key: string;
  source: string;
  department?: string;
}

/* ── ZipRecruiter email parser v2 — body-block extraction ── */
function parseZipRecruiterEmail(subject: string, html: string, messageId: string, textBody?: string): ParsedJob[] {
  const jobs: ParsedJob[] = [];
  const seen = new Set<string>();

  // ── Strategy 1: Parse text body for job blocks ──
  // All ZR emails (all subject families) share the same body format:
  //   Title  <url>
  //   Company • Location [• WorkType]
  //   [$salary]
  //   View Details|Apply Now  <url>
  const body = textBody || html;
  if (body) {
    // Split into lines, normalize
    const lines = body.split(/\r?\n/).map((l) => l.trim());
    
    for (let i = 0; i < lines.length; i++) {
      // Look for Company • Location pattern (bullet separator)
      const companyLineMatch = lines[i].match(/^([A-Z][^•\n]{1,60})\s*[•·]\s*([A-Z][^•\n]{2,40}(?:,\s*[A-Z]{2})?)\s*(?:[•·]\s*(?:In-person|Remote|Hybrid))?$/);
      if (!companyLineMatch) continue;

      const companyRaw = companyLineMatch[1].trim();
      const location = companyLineMatch[2].trim();

      // Skip footer noise
      if (companyRaw.includes("ZipRecruiter") || companyRaw.includes("Ocean Park")) continue;

      // Look backward for job title (the non-empty line before this, skipping blank lines)
      let jobTitle = "";
      let jobUrl = "";
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const prevLine = lines[j];
        if (!prevLine) continue;
        // Skip "View Details" / "Apply Now" from previous block
        if (/^(View Details|Apply Now|Be Seen First|Estimated Pay|New)$/i.test(prevLine)) continue;
        // Extract URL if present: "Title  <url>" or just "Title"
        const urlMatch = prevLine.match(/^(.+?)\s{2,}<(https?:\/\/[^>]+)>$/);
        if (urlMatch) {
          jobTitle = urlMatch[1].trim();
          jobUrl = urlMatch[2];
        } else if (prevLine.length > 3 && prevLine.length < 100 && !prevLine.startsWith("$") && !prevLine.startsWith("http")) {
          jobTitle = prevLine;
        }
        break;
      }

      if (!jobTitle) continue;

      // Look forward for salary (next non-empty line that starts with $)
      let salary = "";
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 3); j++) {
        const nextLine = lines[j];
        if (!nextLine) continue;
        const salaryMatch = nextLine.match(/^\$[\d,.]+(?:K)?(?:\s*[-–]\s*\$[\d,.]+(?:K)?)?(?:\s*\/\s*(?:yr|hr|year|hour))?/i);
        if (salaryMatch) { salary = salaryMatch[0]; }
        break;
      }

      const company = normalizeCompanyName(companyRaw);
      
      // Skip staffing agencies early
      if (isStaffingAgency(company)) continue;

      // Build dedup key
      if (!jobUrl) {
        // Try to find URL in nearby HTML
        const titleEscaped = jobTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const htmlUrlMatch = html.match(new RegExp(`href=["'](https?://[^"']*ziprecruiter\\.com[^"']*?)["'][^>]*>\\s*${titleEscaped}`, "i"));
        if (htmlUrlMatch) jobUrl = htmlUrlMatch[1];
      }

      const key = jobUrl 
        ? buildExternalJobKey(jobUrl, company, jobTitle, location)
        : createHash("sha256").update(`${company}|${jobTitle}|${location}|${messageId}`).digest("hex").slice(0, 24);

      if (seen.has(key)) continue;
      seen.add(key);

      jobs.push({
        title: jobTitle,
        companyname: company,
        location: location || "Denver metro area",
        salary,
        job_url: jobUrl ? canonicalizeUrl(jobUrl) : "https://www.ziprecruiter.com",
        employment_type: "",
        external_job_key: key,
        source: "ziprecruiter_email",
      });
    }
  }

  // ── Strategy 2: Subject-based fallback for single-job emails ──
  // Only used if body parser found 0 jobs
  if (jobs.length === 0) {
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

    // Pattern 6: "Company may want to hire you" / "Lisa, Company may want to hire you"
    if (!company && subject.toLowerCase().includes("may want to hire you")) {
      match = subject.match(/^(?:[^,]+,\s*)?(.+?)\s+may want to hire you$/i);
      if (match) { company = match[1].trim(); title = "Open Position"; }
    }

    // Pattern 7: "$XXX/yr Title job in Location" / "Title job in Location"
    if (!company && subject.toLowerCase().includes("job in")) {
      match = subject.match(/^(?:\$[\d,.]+[Kk]?\/(?:yr|hr)\s+)?(.+?)\s+job in\s+(.+)$/i);
      if (match) { title = match[1].trim(); company = "Multiple"; }
    }

    // Pattern 8: Phil's "Lisa, I think this job might be right for you!"
    if (!company && subject.toLowerCase().includes("might be right for you")) {
      company = "Multiple";
      title = "Phil recommendation";
    }

    // For single-company matches, extract first URL from HTML
    if (title && company && company !== "Multiple") {
      const urlRegex = /href=["'](https?:\/\/[^"']*ziprecruiter\.com\/(?:km|ekm)\/[^"']*?)["']/gi;
      const urls: string[] = [];
      let urlM: RegExpExecArray | null;
      while ((urlM = urlRegex.exec(html)) !== null) {
        const url = urlM[1];
        if (url.includes("unsubscribe") || url.includes("privacy") || url.includes("optout")) continue;
        urls.push(url);
      }

      let salary = "";
      const salaryMatch = html.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*(?:per|\/|a)\s*(?:year|hour|hr|annum))?/i);
      if (salaryMatch) salary = salaryMatch[0];

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
        source: "ziprecruiter_email",
      });
    }
  }

  return jobs;
}

/* ── GovernmentJobs.com / NEOGOV email parser ── */
function parseGovernmentJobsEmail(subject: string, html: string, messageId: string): ParsedJob[] {
  const jobs: ParsedJob[] = [];
  const seen = new Set<string>();

  // ── Strategy 1: Extract all governmentjobs.com job URLs ──
  // Matches: governmentjobs.com/careers/{org}/jobs/{id} or /jobs/{id}/{slug}
  const jobUrlRegex = /href=["'](https?:\/\/[^"']*governmentjobs\.com\/careers\/([^/"']+)\/jobs\/(\d+)(?:[^"']*)?)["']/gi;
  let urlMatch: RegExpExecArray | null;

  while ((urlMatch = jobUrlRegex.exec(html)) !== null) {
    const fullUrl = urlMatch[1];
    const org = urlMatch[2]; // e.g. "colorado"
    const jobId = urlMatch[3]; // e.g. "5248055"
    const key = buildGovJobKey(jobId);

    // Skip duplicates within same email
    if (seen.has(key)) continue;
    seen.add(key);

    // Skip non-job URLs (print views, application pages, etc.)
    if (fullUrl.includes("jobInterestCards") || fullUrl.includes("privacypolicy") || fullUrl.includes("faq")) continue;

    // ── Extract job title from link text or nearby context ──
    let title = "";

    // Method A: Look for the link text (text between <a> and </a>)
    const linkTextRegex = new RegExp(
      `href=["']${fullUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>([^<]+)<`,
      "i"
    );
    const linkTextMatch = html.match(linkTextRegex);
    if (linkTextMatch) {
      const candidate = linkTextMatch[1].trim();
      // Filter out "Apply", "View", "Details", URLs, etc.
      if (candidate.length > 5 && !/^(apply|view|details|click|here|learn more)/i.test(candidate) && !candidate.startsWith("http")) {
        title = candidate;
      }
    }

    // Method B: Extract title from slug in URL
    if (!title) {
      const slugMatch = fullUrl.match(/\/jobs\/\d+(?:-\d+)?\/([^?#"']+)/);
      if (slugMatch) {
        title = slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }

    // Method C: Fall back to subject line
    if (!title) {
      // Common NEOGOV subject patterns:
      // "New Job Posting: Engineer in Training I"
      // "Job Interest Card Notification: Mechanical Engineer"
      // "Colorado - New Job: Engineer in Training"
      const subjectPatterns = [
        /New Job Posting:\s*(.+)/i,
        /Job Interest Card.*?:\s*(.+)/i,
        /New Job:\s*(.+)/i,
        /Job Alert:\s*(.+)/i,
        /Position Available:\s*(.+)/i,
      ];
      for (const pattern of subjectPatterns) {
        const sm = subject.match(pattern);
        if (sm) { title = sm[1].trim(); break; }
      }
    }

    if (!title) title = `Government Job ${jobId}`;

    // ── Extract salary from nearby HTML context ──
    let salary = "";
    // Look for salary near the job URL in the HTML
    const urlIndex = html.indexOf(fullUrl);
    if (urlIndex > -1) {
      // Search within 2000 chars around the URL
      const context = html.slice(Math.max(0, urlIndex - 1000), urlIndex + 1000);
      const salaryMatch = context.match(/\$[\d,]+(?:\.[\d]+)?(?:\s*[-–]\s*\$[\d,]+(?:\.[\d]+)?)?(?:\s*(?:per|\/|a)\s*(?:year|month|hour|hr|annum|monthly|annually))?/i);
      if (salaryMatch) salary = salaryMatch[0];
    }

    // ── Extract location ──
    let location = "Colorado";
    if (urlIndex > -1) {
      const context = html.slice(Math.max(0, urlIndex - 1000), urlIndex + 1000);
      // Common patterns: "Denver, CO", "Grand Junction, CO", "Location: Denver"
      const locMatch = context.match(/(?:Location[:\s]*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*CO\b/);
      if (locMatch) location = `${locMatch[1]}, CO`;
    }

    // ── Extract department ──
    let department = "";
    if (urlIndex > -1) {
      const context = html.slice(Math.max(0, urlIndex - 1000), urlIndex + 1000);
      const deptMatch = context.match(/(?:Department|Division|Agency)[:\s]*([^<\n]{3,60})/i);
      if (deptMatch) department = deptMatch[1].trim();
    }

    // ── Map organization to company name ──
    const orgMap: Record<string, string> = {
      colorado: "State of Colorado",
      cosprings: "City of Colorado Springs",
      cityofdenver: "City of Denver",
      denvergov: "City of Denver",
      aurora: "City of Aurora",
      lakewood: "City of Lakewood",
      jeffco: "Jefferson County",
      douglas: "Douglas County",
      arapahoe: "Arapahoe County",
      adams: "Adams County",
      boulder: "City of Boulder",
      bouldercounty: "Boulder County",
      broomfield: "City of Broomfield",
      thornton: "City of Thornton",
      westminster: "City of Westminster",
      arvada: "City of Arvada",
      rtd: "RTD",
    };
    const companyname = orgMap[org.toLowerCase()] || `${org.charAt(0).toUpperCase()}${org.slice(1)} (Gov)`;

    jobs.push({
      title,
      companyname,
      location,
      salary,
      job_url: canonicalizeUrl(fullUrl),
      employment_type: "Full Time",
      external_job_key: key,
      source: "governmentjobs_email",
      department,
    });
  }

  // ── Strategy 2: If no job URLs found, parse subject for single-job alerts ──
  if (jobs.length === 0) {
    let title = "";
    const subjectPatterns = [
      /New Job Posting:\s*(.+)/i,
      /Job Interest Card.*?:\s*(.+)/i,
      /New Job:\s*(.+)/i,
      /Job Alert:\s*(.+)/i,
      /Position Available:\s*(.+)/i,
    ];
    for (const pattern of subjectPatterns) {
      const sm = subject.match(pattern);
      if (sm) { title = sm[1].trim(); break; }
    }

    if (title) {
      // Try to find any governmentjobs.com URL in the body
      const anyUrlMatch = html.match(/href=["'](https?:\/\/[^"']*governmentjobs\.com\/careers\/[^"']+?)["']/i);
      const url = anyUrlMatch ? anyUrlMatch[1] : "https://www.governmentjobs.com/careers/colorado";
      const key = createHash("sha256").update(`${title}|${subject}|${messageId}`).digest("hex").slice(0, 24);

      let salary = "";
      const salaryMatch = html.match(/\$[\d,]+(?:\.[\d]+)?(?:\s*[-–]\s*\$[\d,]+(?:\.[\d]+)?)?(?:\s*(?:per|\/|a)\s*(?:year|month|hour|hr|annum|monthly|annually))?/i);
      if (salaryMatch) salary = salaryMatch[0];

      jobs.push({
        title,
        companyname: "State of Colorado",
        location: "Colorado",
        salary,
        job_url: canonicalizeUrl(url),
        employment_type: "Full Time",
        external_job_key: `gov_subj_${key}`,
        source: "governmentjobs_email",
      });
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

/* ── Niche assignment for government jobs ── */
function getGovNiche(title: string, department: string): string {
  const combined = `${title} ${department}`.toLowerCase();
  if (combined.includes("transportation") || combined.includes("cdot") || combined.includes("highway") || combined.includes("bridge")) {
    return "Government / Public Works / Infrastructure";
  }
  if (combined.includes("water") || combined.includes("utility") || combined.includes("wastewater")) {
    return "Government / Public Works / Infrastructure";
  }
  if (combined.includes("energy") || combined.includes("renewable")) {
    return "Energy / Renewables / Power";
  }
  return "Government / Public Works / Infrastructure";
}

/* ── Main handler ── */
export async function POST(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Replay mode: optional { messageId, dryRun } in request body ──
  let replayMessageId: string | null = null;
  let dryRun = false;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.messageId) replayMessageId = body.messageId;
    if (body.dryRun) dryRun = true;
  } catch { /* no body = normal cron mode */ }

  const isReplay = !!replayMessageId;
  const replayResults: Array<{ parsed: ParsedJob; companyMatch: string | null; companyId: number | null; action: string }> = [];

  // Skip ingest run logging in dryRun mode
  let runId: number | null = null;
  if (!dryRun) {
    const { data: run } = await supabaseAdmin.from("job_ingest_runs").insert({ status: isReplay ? "replay" : "running" }).select("id").single();
    runId = run?.id;
  }
  let messagesSeen = 0;
  let jobsExtracted = 0;
  let companiesCreated = 0;
  const sourceStats: Record<string, number> = { ziprecruiter: 0, governmentjobs: 0 };

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

    if (isReplay) {
      // ── Replay mode: process only the specified message, skip dedupe ──
      messageIds = [replayMessageId!];
    } else if (account.last_history_id) {
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

    if (!isReplay && !account.last_history_id) {
      // ── MULTI-SOURCE QUERY: fetch both ZipRecruiter AND GovernmentJobs emails ──
      const list = await gmail.users.messages.list({
        userId: "me", maxResults: 100,
        q: account.label_id ? undefined : "from:ziprecruiter.com OR from:noreply@governmentjobs.com",
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
        // In replay mode, skip the dedupe check so we can re-process
        if (!isReplay && processedSet.has(msgId)) continue;

        const msg = await gmail.users.messages.get({ userId: "me", id: msgId, format: "full" });
        const payload = msg.data.payload;
        if (!payload) continue;

        const subject = getHeader(payload.headers, "Subject");
        const from = getHeader(payload.headers, "From");
        const dateStr = getHeader(payload.headers, "Date");

        // ── Route to the correct parser based on source ──
        const source = detectSource(from);
        if (source === "unknown") continue;

        const html = getBody(payload);
        const textBody = getTextBody(payload);
        let parsedJobs: ParsedJob[] = [];

        if (source === "ziprecruiter") {
          parsedJobs = parseZipRecruiterEmail(subject, html, msgId, textBody);
        } else if (source === "governmentjobs") {
          parsedJobs = parseGovernmentJobsEmail(subject, html, msgId);
        }

        for (const job of parsedJobs) {
          // Skip staffing agencies (only relevant for ZR, but check anyway)
          if (isStaffingAgency(job.companyname)) continue;

          // Match or create company
          let matched = matchCompanyInMemory(job.companyname, companyList);
          let companyId: number | null = matched?.id || null;
          const canonicalName = matched?.name || normalizeCompanyName(job.companyname);

          if (dryRun) {
            // ── DryRun: collect parsed result, skip writes ──
            replayResults.push({
              parsed: job,
              companyMatch: matched?.name || null,
              companyId,
              action: matched ? "matched_existing" : "would_create",
            });
            jobsExtracted++;
            sourceStats[source]++;
            continue;
          }

          if (!matched && job.companyname !== "See listing" && job.companyname !== "Multiple") {
            // Determine niche based on source
            const niche = source === "governmentjobs"
              ? getGovNiche(job.title, job.department || "")
              : "ZipRecruiter Intake";

            // Create new company
            const { data: newCo } = await supabaseAdmin.from("companies").insert({
              companyname: canonicalName,
              company_key: slugify(canonicalName),
              city: "Denver",
              tier: 4,
              niche,
              company_about: source === "governmentjobs"
                ? `Colorado state agency. Added from governmentjobs.com ingest. Job: ${job.title}`
                : `Added from ZipRecruiter ingest. Job: ${job.title}`,
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
            source: job.source,
            external_job_key: job.external_job_key,
            gmail_message_id: msgId,
            job_url: canonicalizeUrl(job.job_url),
            received_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
            raw_payload: {
              parserVersion: 3,
              source: job.source,
              subject,
              from,
              messageId: msgId,
              parsedJob: job,
              // Store first 5000 chars of HTML for debugging new parsers
              htmlPreview: html.slice(0, 5000),
            },
            ingest_status: "new",
            parser_version: 3,
          }, { onConflict: "source,external_job_key" });

          if (!upsertErr) {
            jobsExtracted++;
            sourceStats[source]++;

            // ── Replay mode: collect upsert result ──
            if (isReplay) {
              replayResults.push({
                parsed: job,
                companyMatch: matched?.name || canonicalName,
                companyId,
                action: matched ? "upserted_matched" : "upserted_created",
              });
            }
          }
        }
      } catch (msgErr) {
        console.error(`Error processing message ${msgId}:`, msgErr);
      }
    }

    if (runId) {
      await supabaseAdmin.from("job_ingest_runs").update({
        finished_at: new Date().toISOString(), messages_seen: messagesSeen,
        jobs_extracted: jobsExtracted, companies_created: companiesCreated,
        status: isReplay ? "replay_completed" : "completed",
      }).eq("id", runId);
    }

    const response: Record<string, unknown> = {
      success: true,
      mode: dryRun ? "dryRun" : isReplay ? "replay" : "cron",
      messages_seen: messagesSeen,
      jobs_extracted: jobsExtracted,
      companies_created: companiesCreated,
      sources: sourceStats,
    };
    if (isReplay || dryRun) {
      response.replay = replayResults;
    }

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Ingest error:", message);
    if (runId) {
      await supabaseAdmin.from("job_ingest_runs").update({ finished_at: new Date().toISOString(), status: "error", error_text: message }).eq("id", runId);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

