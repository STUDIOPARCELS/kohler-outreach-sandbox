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

/* ── MIME helpers ── */
function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function getBodyPart(payload: gmail_v1.Schema$MessagePart, mimeType: string): string {
  if (payload.mimeType === mimeType && payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = getBodyPart(part, mimeType);
      if (found) return found;
    }
  }
  return "";
}

function getBody(payload: gmail_v1.Schema$MessagePart): { content: string; mime: string } {
  // Prefer HTML
  const html = getBodyPart(payload, "text/html");
  if (html) return { content: html, mime: "text/html" };
  // Fallback to plain text
  const text = getBodyPart(payload, "text/plain");
  if (text) return { content: text, mime: "text/plain" };
  // Raw fallback
  if (payload.body?.data) return { content: decodeBase64Url(payload.body.data), mime: "raw" };
  return { content: "", mime: "none" };
}

/** Strip HTML to plain text, preserving link info */
function htmlToText(html: string): string {
  const URL_OPEN = "\u00AB"; // «
  const URL_CLOSE = "\u00BB"; // »
  let text = html
    // Remove style and script blocks entirely
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    // Convert links to "text «URL»" (using non-HTML delimiters)
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, linkText) => {
      const clean = linkText.replace(/<[^>]+>/g, "").trim();
      return clean ? `${clean}  ${URL_OPEN}${url}${URL_CLOSE}` : `${URL_OPEN}${url}${URL_CLOSE}`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|td|th|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    // Decode HTML entities
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    // Restore URL delimiters to angle brackets
    .replace(new RegExp(URL_OPEN, "g"), "<")
    .replace(new RegExp(URL_CLOSE, "g"), ">")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

/* ── Normalization ── */
function normalizeCompanyName(name: string): string {
  return name
    .replace(/[,\s]+(Corp\.?|Corporation|Inc\.?|LLC|Ltd\.?|Co\.?|Manufacturing|Services|Industries|Group)\.?\s*$/i, "")
    .trim();
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* ── Fingerprint-based dedupe key ── */
function buildContentKey(company: string, title: string, location: string): string {
  const input = [
    normalizeCompanyName(company).toLowerCase().trim(),
    title.toLowerCase().trim(),
    location.toLowerCase().trim(),
  ].join("|");
  return "zrc_" + createHash("sha256").update(input).digest("hex").slice(0, 20);
}

/* ── GovernmentJobs key ── */
function buildGovJobKey(jobId: string): string {
  return `gov_${jobId}`;
}

/* ── Staffing agency blocklist ── */
const STAFFING_BLOCKLIST = new Set([
  "cybercoders", "jobot", "insight global", "belcan", "rolinc staffing",
  "executive recruiting", "executive recruiting group", "extensishr",
  "first solutions", "first solutions group", "liberty personnel",
  "liberty personnel services", "matchstick", "point solutions",
  "point solutions group", "epc staff", "epc staff acquisition",
  "robert half", "randstad", "adecco", "manpower", "kelly services",
  "aerotek", "hays", "spherion", "modis", "teksystems", "apex systems",
  "pts advance", "professional employment group",
]);

function isStaffingAgency(company: string): boolean {
  const clean = normalizeCompanyName(company).toLowerCase();
  return STAFFING_BLOCKLIST.has(clean) ||
    STAFFING_BLOCKLIST.has(company.toLowerCase()) ||
    clean.includes("staffing") || clean.includes("recruiting") || clean.includes("personnel");
}

/* ── Source detection ── */
type EmailSource = "ziprecruiter" | "governmentjobs" | "unknown";

function detectSource(from: string, body: string): EmailSource {
  const lower = from.toLowerCase();
  if (lower.includes("ziprecruiter")) return "ziprecruiter";
  if (lower.includes("governmentjobs") || lower.includes("neogov")) return "governmentjobs";
  // Body-based fallback: if body contains ZR job links
  if (body.includes("ziprecruiter.com/km/") || body.includes("ziprecruiter.com/ekm/")) return "ziprecruiter";
  return "unknown";
}

/* ── Shared types ── */
interface ParsedJob {
  title: string;
  companyname: string;
  location: string;
  salary: string;
  employment_type: string;
  job_url: string;
  source: string;
  external_job_key: string;
  department?: string;
  block_index?: number;
}

/* ══════════════════════════════════════════════════════════════
   ZipRecruiter BODY-BASED PARSER
   ══════════════════════════════════════════════════════════════ */

const ZR_URL_PATTERN = /https?:\/\/www\.ziprecruiter\.com\/[ek]?km\/[A-Za-z0-9_-]+[^\s<>"')}\]]*(?:\?[^\s<>"')}\]]*)?/g;

const JUNK_PATTERNS = [
  /view\s+more\s+jobs/i,
  /privacy\s+policy/i,
  /unsubscribe/i,
  /clearbit/i,
  /get\s+hired\s+faster/i,
  /download\s+the\s+free/i,
  /ios\s+or\s+android/i,
];

const ACTION_PATTERNS = [
  /^\s*(view\s+details)\s*$/i,
  /^\s*(apply\s+now)\s*$/i,
  /^\s*(quick\s+apply)\s*$/i,
  /^\s*(be\s+seen\s+first)\s*$/i,
];

function isJunkText(text: string): boolean {
  return JUNK_PATTERNS.some((p) => p.test(text));
}

function isActionText(text: string): boolean {
  return ACTION_PATTERNS.some((p) => p.test(text.trim()));
}

interface RawBlock {
  text: string;
  url: string;
  type: "title" | "action" | "junk";
}

function parseZipRecruiterBody(bodyText: string): ParsedJob[] {
  const jobs: ParsedJob[] = [];
  const seen = new Set<string>();

  // Extract all "text <URL>" segments
  const segmentRegex = /([^\n<]*?)\s*<(https?:\/\/www\.ziprecruiter\.com\/[ek]?km\/[^\s<>"')\]]+)>/g;
  const blocks: RawBlock[] = [];
  let m: RegExpExecArray | null;

  while ((m = segmentRegex.exec(bodyText)) !== null) {
    const text = m[1].replace(/\*\s*/g, "").trim();
    const url = m[2].trim();

    if (isJunkText(text) || url.includes("unsubscribe") || url.includes("privacy") || url.includes("clearbit")) {
      blocks.push({ text, url, type: "junk" });
    } else if (isActionText(text) || text === "" || text === "New") {
      blocks.push({ text, url, type: "action" });
    } else {
      blocks.push({ text, url, type: "title" });
    }
  }

  // Group: each "title" block followed by context until the next "title" or "junk"
  let blockIndex = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type !== "title") continue;

    const title = block.text;
    const jobUrl = block.url;

    // Find context between this title URL and the next title/junk URL
    const titleUrlEnd = bodyText.indexOf(block.url) + block.url.length;
    let contextEnd = bodyText.length;

    // Find the next title block's text position
    for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[j].type === "title") {
        const nextTitlePos = bodyText.indexOf(blocks[j].text + "  <" + blocks[j].url, titleUrlEnd);
        if (nextTitlePos > -1) { contextEnd = nextTitlePos; break; }
        // Fallback: find the next title's URL
        const nextUrlPos = bodyText.indexOf(blocks[j].url, titleUrlEnd);
        if (nextUrlPos > -1) { contextEnd = nextUrlPos; break; }
      }
      if (blocks[j].type === "junk") {
        const junkPos = bodyText.indexOf(blocks[j].url, titleUrlEnd);
        if (junkPos > -1) { contextEnd = junkPos; break; }
      }
    }

    const context = bodyText.slice(titleUrlEnd, contextEnd);

    // Parse company + location from context
    // Pattern: "Company • City, ST" or "Company • City, ST • In-person"
    let companyname = "";
    let location = "";
    let salary = "";
    let employment_type = "";

    const lines = context.split("\n").map((l) => l.replace(/\*\s*/g, "").trim()).filter(Boolean);

    for (const line of lines) {
      // Skip action lines, URLs, junk
      if (isActionText(line)) continue;
      if (line.startsWith("http")) continue;
      if (isJunkText(line)) continue;
      if (/^(New|Estimated Pay|Be Seen First)$/i.test(line)) continue;

      // Company • Location pattern (bullet separator)
      if ((line.includes("•") || line.includes("·")) && !companyname) {
        const parts = line.split(/[•·]/).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          companyname = parts[0];
          location = parts.slice(1).join(", ").trim();
          // Clean up work type from location
          const workTypes = ["In-person", "Hybrid", "Remote", "On-site"];
          for (const wt of workTypes) {
            if (location.toLowerCase().includes(wt.toLowerCase())) {
              employment_type = wt;
              location = location.replace(new RegExp(",?\\s*" + wt, "i"), "").trim();
            }
          }
          continue;
        }
      }

      // Salary pattern
      if (/^\$[\d,]+/.test(line) && !salary) {
        salary = line.replace(/\s*(Estimated Pay|Be Seen First)$/i, "").trim();
        continue;
      }

      // Employment type
      if (/^(Full-Time|Part-Time|Contract|Temporary|Internship)$/i.test(line) && !employment_type) {
        employment_type = line;
        continue;
      }

      // Benefits line — skip
      if (/Medical|Vision|Dental|Retirement/i.test(line)) continue;

      // If no company yet and this looks like a company name (no special chars, reasonable length)
      if (!companyname && line.length > 2 && line.length < 80 && !/^[\$<]/.test(line)) {
        companyname = line;
      }
    }

    // Skip if no title or no company
    if (!title || title.length < 5) continue;
    if (!companyname || companyname.length < 2) continue;

    // Filter intro/greeting text that leaked in as titles
    const titleClean = title.trim();
    const introPatterns = [
      /today's jobs/i, /recommended for you/i, /here's a new job/i,
      /jumpstart on the competition/i, /get it in front of you/i,
      /^hi\s+\w+/i, /^hello/i, /^hey\b/i,
      /^-->/, /^--$/, /^-+>?$/, /^new$/i, /^phil$/i,
      /^your career/i, /^get hired/i, /^download/i,
      /^view more jobs$/i,
    ];
    if (introPatterns.some((p) => p.test(titleClean))) continue;

    // Clean company name: strip leading > or * or bullets
    companyname = companyname.replace(/^[>*•·\s]+/, "").trim();
    if (!companyname || companyname.length < 2) continue;

    // Build fingerprint key
    const key = buildContentKey(companyname, title, location);
    if (seen.has(key)) continue;
    seen.add(key);

    jobs.push({
      title,
      companyname: normalizeCompanyName(companyname),
      location: location || "Denver metro area",
      salary,
      employment_type,
      job_url: jobUrl.split("?")[0], // Strip tracking params for cleaner URL
      source: "ziprecruiter_email",
      external_job_key: key,
      block_index: blockIndex++,
    });
  }

  return jobs;
}

/* ══════════════════════════════════════════════════════════════
   GovernmentJobs PARSER (unchanged from v3)
   ══════════════════════════════════════════════════════════════ */

function canonicalizeUrl(url: string): string {
  try { const u = new URL(url); return u.origin + u.pathname; } catch { return url; }
}

function parseGovernmentJobsEmail(subject: string, bodyText: string, messageId: string): ParsedJob[] {
  const jobs: ParsedJob[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];

  // Extract governmentjobs.com job URLs
  const jobUrlRegex = /<(https?:\/\/[^<>]*governmentjobs\.com\/careers\/([^/"'<>]+)\/jobs\/(\d+)[^<>]*)>/gi;
  let urlMatch: RegExpExecArray | null;

  while ((urlMatch = jobUrlRegex.exec(bodyText)) !== null) {
    const fullUrl = urlMatch[1];
    const org = urlMatch[2];
    const jobId = urlMatch[3];
    const key = buildGovJobKey(jobId);
    if (seen.has(key)) continue;
    seen.add(key);
    if (fullUrl.includes("jobInterestCards") || fullUrl.includes("privacypolicy") || fullUrl.includes("faq")) continue;

    let title = "";
    const slugMatch = fullUrl.match(/\/jobs\/\d+(?:-\d+)?\/([^?#"'<>]+)/);
    if (slugMatch) title = slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    // Subject fallback
    if (!title) {
      const subjectPatterns = [/New Job Posting:\s*(.+)/i, /Job Interest Card.*?:\s*(.+)/i, /New Job:\s*(.+)/i, /Job Alert:\s*(.+)/i];
      for (const p of subjectPatterns) { const sm = subject.match(p); if (sm) { title = sm[1].trim(); break; } }
    }
    if (!title) title = `Government Job ${jobId}`;

    let salary = "";
    const urlIdx = bodyText.indexOf(fullUrl);
    if (urlIdx > -1) {
      const ctx = bodyText.slice(Math.max(0, urlIdx - 1000), urlIdx + 1000);
      const sm = ctx.match(/\$[\d,]+(?:\.[\d]+)?(?:\s*[-–]\s*\$[\d,]+(?:\.[\d]+)?)?(?:\s*(?:per|\/|a)\s*(?:year|month|hour|hr|annum|monthly|annually))?/i);
      if (sm) salary = sm[0];
    }

    let location = "Colorado";
    if (urlIdx > -1) {
      const ctx = bodyText.slice(Math.max(0, urlIdx - 1000), urlIdx + 1000);
      const lm = ctx.match(/(?:Location[:\s]*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*CO\b/);
      if (lm) location = `${lm[1]}, CO`;
    }

    const orgMap: Record<string, string> = {
      colorado: "State of Colorado", cosprings: "City of Colorado Springs",
      cityofdenver: "City of Denver", denvergov: "City of Denver",
      aurora: "City of Aurora", lakewood: "City of Lakewood",
      jeffco: "Jefferson County", douglas: "Douglas County",
      arapahoe: "Arapahoe County", adams: "Adams County",
      boulder: "City of Boulder", bouldercounty: "Boulder County",
      broomfield: "City of Broomfield", thornton: "City of Thornton",
      westminster: "City of Westminster", arvada: "City of Arvada", rtd: "RTD",
    };
    const companyname = orgMap[org.toLowerCase()] || `${org.charAt(0).toUpperCase()}${org.slice(1)} (Gov)`;

    jobs.push({
      title, companyname, location, salary,
      job_url: canonicalizeUrl(fullUrl),
      employment_type: "Full Time",
      external_job_key: key,
      source: "governmentjobs_email",
    });
  }

  // If no URLs found but source was detected, persist raw for debug
  if (jobs.length === 0) {
    warnings.push("GovernmentJobs email detected but no job URLs extracted. Raw payload saved for replay tuning.");
  }

  return jobs;
}

/* ══════════════════════════════════════════════════════════════
   RELEVANCE GATE — score jobs for Kohler's ME/EIT profile
   ══════════════════════════════════════════════════════════════ */

interface RelevanceResult {
  is_relevant: boolean;
  match_score: number;
  relevance_reason: string;
}

const TITLE_BOOST: Array<[RegExp, number, string]> = [
  [/\bmechanical\s+engineer\s*(?:i|1)?\b/i, 30, "mechanical engineer (entry)"],
  [/\bmechanical\s+design\s+engineer\b/i, 28, "mechanical design engineer"],
  [/\bengineer\s+in\s+training\b/i, 35, "engineer in training"],
  [/\beit\b/i, 35, "EIT"],
  [/\bmanufacturing\s+engineer\b/i, 20, "manufacturing engineer"],
  [/\bdesign\s+engineer\b/i, 22, "design engineer"],
  [/\bproduct\s+development\s+engineer\b/i, 22, "product development engineer"],
  [/\bmechanical\s+engineer\b/i, 25, "mechanical engineer"],
  [/\bengineer\b/i, 10, "engineer (general)"],
];

const TITLE_PENALTY: Array<[RegExp, number, string]> = [
  [/\b(?:senior|sr\.?)\b/i, -15, "senior-level"],
  [/\b(?:lead|principal|staff)\b/i, -20, "lead/principal/staff"],
  [/\b(?:manager|director|vp|chief)\b/i, -25, "management"],
  [/\b(?:pe|p\.e\.)\b(?!\s*i)/i, -10, "PE required"],
  [/\b(?:iii|iv|v|3|4|5)\b/i, -12, "level III+"],
];

function scoreRelevance(title: string, location: string): RelevanceResult {
  const reasons: string[] = [];
  let score = 0;

  // Title scoring
  for (const [pattern, points, label] of TITLE_BOOST) {
    if (pattern.test(title)) {
      score += points;
      reasons.push(`+${points} ${label}`);
      break; // Take highest match only
    }
  }

  for (const [pattern, points, label] of TITLE_PENALTY) {
    if (pattern.test(title)) {
      score += points;
      reasons.push(`${points} ${label}`);
    }
  }

  // Location scoring
  const loc = location.toLowerCase();
  if (loc.includes(", co") || loc.includes("colorado") || loc.includes("denver") || loc.includes("boulder") || loc.includes("arvada") || loc.includes("littleton") || loc.includes("englewood") || loc.includes("centennial") || loc.includes("broomfield") || loc.includes("lakewood") || loc.includes("aurora") || loc.includes("westminster") || loc.includes("longmont")) {
    score += 15;
    reasons.push("+15 Colorado");
  } else if (loc.includes("remote")) {
    score += 5;
    reasons.push("+5 remote");
  } else if (loc && !loc.includes("nationwide")) {
    score -= 10;
    reasons.push("-10 out-of-state");
  }

  const is_relevant = score >= 15;
  return {
    is_relevant,
    match_score: score,
    relevance_reason: reasons.join("; ") || "no matching signals",
  };
}
/* ── Company matching ── */
interface CompanyRow { id: number; name: string; lower: string; }

function matchCompanyInMemory(jobCompany: string, companyList: CompanyRow[]): CompanyRow | null {
  const clean = normalizeCompanyName(jobCompany).toLowerCase();
  const exact = companyList.find((c) => c.lower === clean || c.lower === jobCompany.toLowerCase());
  if (exact) return exact;
  const forward = companyList.find((c) => c.lower.includes(clean) && clean.length >= 4);
  if (forward) return forward;
  const reverse = companyList.filter((c) => c.lower.length >= 4 && clean.includes(c.lower)).sort((a, b) => b.lower.length - a.lower.length);
  if (reverse.length > 0) return reverse[0];
  return null;
}

/* ── Niche assignment for government jobs ── */
function getGovNiche(title: string, department: string): string {
  const combined = `${title} ${department}`.toLowerCase();
  if (combined.includes("transportation") || combined.includes("cdot") || combined.includes("highway") || combined.includes("bridge"))
    return "Government / Public Works / Infrastructure";
  if (combined.includes("water") || combined.includes("utility") || combined.includes("wastewater"))
    return "Government / Public Works / Infrastructure";
  if (combined.includes("energy") || combined.includes("renewable"))
    return "Energy / Renewables / Power";
  return "Government / Public Works / Infrastructure";
}

/* ══════════════════════════════════════════════════════════════
   MAIN HANDLER
   ══════════════════════════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Parse request body for replay mode ──
  let replayMessageId: string | null = null;
  let dryRun = false;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.messageId) replayMessageId = body.messageId;
    if (body.dryRun) dryRun = true;
  } catch { /* no body = normal cron mode */ }

  // ── Validate messageId length ──
  if (replayMessageId && replayMessageId.length < 16) {
    return NextResponse.json({
      error: "Invalid messageId",
      detail: `Provided messageId "${replayMessageId}" appears truncated (${replayMessageId.length} chars). Gmail message IDs are typically 16+ hex characters. Use the full ID from gmail_search_messages.`,
    }, { status: 400 });
  }

  const isReplay = !!replayMessageId;
  const replayResults: Array<{
    parsed: ParsedJob;
    companyMatch: string | null;
    companyId: number | null;
    action: string;
    relevance?: RelevanceResult;
  }> = [];
  const warnings: string[] = [];

  let runId: string | null = null;
  if (!dryRun) {
    const { data: run } = await supabaseAdmin.from("job_ingest_runs").insert({
      status: isReplay ? "replay" : "running",
    }).select("id").single();
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
    const companyList: CompanyRow[] = (allCompanies || []).map((c) => ({
      id: c.id, name: c.companyname, lower: c.companyname.toLowerCase(),
    }));

    // Pre-load processed message IDs
    const { data: processed } = await supabaseAdmin.from("job_listings").select("gmail_message_id").not("gmail_message_id", "is", null);
    const processedSet = new Set((processed || []).map((p) => p.gmail_message_id));

    let messageIds: string[] = [];

    if (isReplay) {
      messageIds = [replayMessageId!];
    } else if (account.last_history_id) {
      try {
        const history = await gmail.users.history.list({
          userId: "me",
          startHistoryId: account.last_history_id,
          historyTypes: ["messageAdded"],
        });
        const added = history.data.history?.flatMap((h) =>
          h.messagesAdded?.map((m) => m.message?.id).filter(Boolean) || []
        ) || [];
        messageIds = added.filter((id): id is string => !!id);
        if (history.data.historyId) {
          await supabaseAdmin.from("gmail_accounts").update({
            last_history_id: history.data.historyId,
            updated_at: new Date().toISOString(),
          }).eq("id", account.id);
        }
      } catch (err: unknown) {
        if ((err as { code?: number })?.code === 404) { account.last_history_id = null; }
        else throw err;
      }
    }

    if (!isReplay && !account.last_history_id) {
      // Sender-domain query is ALWAYS primary — label is optional accelerator
      const q = "from:(ziprecruiter.com OR governmentjobs.com)";
      const list = await gmail.users.messages.list({
        userId: "me", maxResults: 100,
        q,
      });
      messageIds = list.data.messages?.map((m) => m.id).filter((id): id is string => !!id) || [];
      if (messageIds.length > 0) {
        const firstMsg = await gmail.users.messages.get({ userId: "me", id: messageIds[0], format: "METADATA" });
        if (firstMsg.data.historyId) {
          await supabaseAdmin.from("gmail_accounts").update({
            last_history_id: firstMsg.data.historyId,
            updated_at: new Date().toISOString(),
          }).eq("id", account.id);
        }
      }
    }

    messagesSeen = messageIds.length;

    for (const msgId of messageIds) {
      try {
        if (!isReplay && processedSet.has(msgId)) continue;

        const msg = await gmail.users.messages.get({ userId: "me", id: msgId, format: "full" });
        const payload = msg.data.payload;
        if (!payload) continue;

        const subject = getHeader(payload.headers, "Subject");
        const from = getHeader(payload.headers, "From");
        const dateStr = getHeader(payload.headers, "Date");

        // Extract body with MIME preference
        const { content: rawBody, mime } = getBody(payload);
        const bodyText = mime === "text/html" ? htmlToText(rawBody) : rawBody;

        // Route to correct parser
        const source = detectSource(from, bodyText);
        if (source === "unknown") continue;

        let parsedJobs: ParsedJob[] = [];

        if (source === "ziprecruiter") {
          parsedJobs = parseZipRecruiterBody(bodyText);
        } else if (source === "governmentjobs") {
          parsedJobs = parseGovernmentJobsEmail(subject, bodyText, msgId);
        }

        // ── Replay diagnostics ──
        if (isReplay || dryRun) {
          const zrUrlsInText = (bodyText.match(/ziprecruiter\.com\/e?km\//g) || []).length;
          const zrUrlsInRaw = (rawBody.match(/ziprecruiter\.com\/e?km\//g) || []).length;
          const segCount = (bodyText.match(/\s*<https?:\/\/www\.ziprecruiter\.com\/e?km\//g) || []).length;
          const anyZrInText = (bodyText.match(/ziprecruiter\.com/g) || []).length;
          const anyZrInRaw = (rawBody.match(/ziprecruiter\.com/g) || []).length;
          warnings.push(`[diag] msgId=${msgId} mime=${mime} rawLen=${rawBody.length} textLen=${bodyText.length} zrUrlsRaw=${zrUrlsInRaw} zrUrlsText=${zrUrlsInText} segments=${segCount} anyZrRaw=${anyZrInRaw} anyZrText=${anyZrInText} parsed=${parsedJobs.length} source=${source} subject="${subject.slice(0,60)}"`);
          warnings.push(`[text_sample] ${bodyText.slice(0, 800).replace(/\n/g, "\\n")}`);
        }

        if (parsedJobs.length === 0 && source === "governmentjobs") {
          warnings.push(`GovernmentJobs email ${msgId} yielded 0 jobs. Raw saved for debug.`);
        }

        for (const job of parsedJobs) {
          if (isStaffingAgency(job.companyname)) continue;

          // Score relevance for Kohler's ME/EIT profile
          const relevance = scoreRelevance(job.title, job.location || "");

          let matched = matchCompanyInMemory(job.companyname, companyList);
          let companyId: number | null = matched?.id || null;
          // Parser already normalizes company names — don't re-normalize here
          const canonicalName = matched?.name || job.companyname;

          if (dryRun) {
            replayResults.push({
              parsed: job,
              companyMatch: matched?.name || null,
              companyId,
              action: matched ? "matched_existing" : "would_create",
              relevance,
            });
            jobsExtracted++;
            sourceStats[source]++;
            continue;
          }

          // Create company if needed
          if (!matched && job.companyname !== "See listing" && job.companyname !== "Multiple") {
            const niche = source === "governmentjobs"
              ? getGovNiche(job.title, job.department || "")
              : "ZipRecruiter Intake";

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

          // Upsert with tracking columns
          const now = new Date().toISOString();
          const receivedAt = dateStr ? new Date(dateStr).toISOString() : now;

          // Check if row exists for tracking updates
          const { data: existing } = await supabaseAdmin.from("job_listings")
            .select("id, times_seen, first_seen_at")
            .eq("source", job.source)
            .eq("external_job_key", job.external_job_key)
            .maybeSingle();

          if (existing) {
            // Update existing row — preserve first_seen_at, bump last_seen_at and times_seen
            const { error: updateErr } = await supabaseAdmin.from("job_listings")
              .update({
                last_seen_at: now,
                times_seen: (existing.times_seen || 1) + 1,
                gmail_message_id: msgId,
                salary: job.salary || undefined,
                employment_type: job.employment_type || undefined,
              })
              .eq("id", existing.id);

            if (!updateErr) {
              jobsExtracted++;
              sourceStats[source]++;
              if (isReplay) {
                replayResults.push({
                  parsed: job,
                  companyMatch: matched?.name || canonicalName,
                  companyId,
                  action: "updated_existing",
                });
              }
            }
          } else {
            // Insert new row
            const { error: insertErr } = await supabaseAdmin.from("job_listings").insert({
              companyname: matched?.name || canonicalName,
              company_id: companyId,
              title: job.title,
              salary: job.salary || null,
              location: job.location || null,
              employment_type: job.employment_type || null,
              source: job.source,
              external_job_key: job.external_job_key,
              gmail_message_id: msgId,
              job_url: job.job_url,
              received_at: receivedAt,
              first_seen_at: receivedAt,
              last_seen_at: now,
              times_seen: 1,
              is_relevant: relevance.is_relevant,
              match_score: relevance.match_score,
              relevance_reason: relevance.relevance_reason,
              raw_payload: {
                parserVersion: 5,
                source: job.source,
                subject,
                from,
                messageId: msgId,
                mime,
                blockIndex: job.block_index,
              },
              ingest_status: "new",
              parser_version: 5,
            });

            if (!insertErr) {
              jobsExtracted++;
              sourceStats[source]++;
              if (isReplay) {
                replayResults.push({
                  parsed: job,
                  companyMatch: matched?.name || canonicalName,
                  companyId,
                  action: matched ? "inserted_matched" : "inserted_created",
                  relevance,
                });
              }
            }
          }
        }
      } catch (msgErr) {
        const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr);
        console.error(`Error processing message ${msgId}:`, errMsg);
        warnings.push(`Message ${msgId}: ${errMsg}`);
      }
    }

    if (runId) {
      await supabaseAdmin.from("job_ingest_runs").update({
        finished_at: new Date().toISOString(),
        messages_seen: messagesSeen,
        jobs_extracted: jobsExtracted,
        companies_created: companiesCreated,
        status: isReplay ? "replay_completed" : "completed",
      }).eq("id", runId);
    }

    const response: Record<string, unknown> = {
      success: true,
      mode: dryRun ? "dryRun" : isReplay ? "replay" : "cron",
      parser_version: 5,      messages_seen: messagesSeen,
      jobs_extracted: jobsExtracted,
      companies_created: companiesCreated,
      sources: sourceStats,
    };
    if (isReplay || dryRun) response.replay = replayResults;
    if (warnings.length > 0) response.warnings = warnings;

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Ingest error:", message);
    if (runId) {
      await supabaseAdmin.from("job_ingest_runs").update({
        finished_at: new Date().toISOString(), status: "error", error_text: message,
      }).eq("id", runId);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
