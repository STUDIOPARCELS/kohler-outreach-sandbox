export type ReplyClassification =
  | "positive_reply"
  | "recruiter_screen"
  | "apply_online"
  | "referral"
  | "needs_follow_up"
  | "rejection"
  | "bounce"
  | "out_of_office"
  | "auto_reply"
  | "unknown";

export interface OutreachHistoryRow {
  id: string;
  companyname: string | null;
  contactname: string | null;
  contact_email: string | null;
  subject_final: string | null;
  status: string | null;
  emailed_at: string | null;
  sent_at: string | null;
  printed_at: string | null;
  updated_at: string | null;
  job_title?: string | null;
  job_url?: string | null;
}

export interface MatchedOutreach {
  row: OutreachHistoryRow;
  matchedBy: string;
  channel: "email" | "letter" | "unknown";
}

export interface GmailClassificationInput {
  fromEmail?: string | null;
  subject?: string | null;
  snippet?: string | null;
  headers?: Record<string, string | undefined>;
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function normalizeEmail(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function extractEmailAddress(value: string | null | undefined): string | null {
  const match = (value || "").match(EMAIL_PATTERN);
  return match?.[0]?.toLowerCase() || null;
}

export function extractEmailAddresses(value: string | null | undefined): string[] {
  const matches = (value || "").match(EMAIL_PATTERN) || [];
  return Array.from(new Set(matches.map((email) => email.toLowerCase())));
}

export function normalizeSubject(value: string | null | undefined): string {
  return (value || "")
    .replace(/^(\s*(re|fw|fwd)\s*:\s*)+/i, "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getHeader(headers: Record<string, string | undefined> | undefined, name: string): string {
  if (!headers) return "";
  const normalized = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalized) return value || "";
  }
  return "";
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyGmailReply(input: GmailClassificationInput): ReplyClassification {
  const from = normalizeEmail(input.fromEmail);
  const subject = input.subject || "";
  const snippet = input.snippet || "";
  const text = `${subject} ${snippet}`.toLowerCase();
  const autoSubmitted = getHeader(input.headers, "auto-submitted").toLowerCase();
  const precedence = getHeader(input.headers, "precedence").toLowerCase();

  if (
    /mailer-daemon|postmaster|no-?reply@|do-?not-?reply@/.test(from) ||
    includesAny(text, [
      /delivery status notification/,
      /delivery failure/,
      /undeliver(?:ed|able)/,
      /address not found/,
      /message wasn'?t delivered/,
      /mail delivery failed/,
      /returned mail/,
    ])
  ) {
    return "bounce";
  }

  if (
    includesAny(text, [/out of office/, /automatic reply/, /auto(?:matic)? response/, /\booo\b/]) ||
    (autoSubmitted && autoSubmitted !== "no") ||
    precedence === "bulk" ||
    precedence === "auto_reply"
  ) {
    return "out_of_office";
  }

  if (
    includesAny(text, [
      /not moving forward/,
      /unfortunately/,
      /not a fit/,
      /no current openings/,
      /we'?ll keep (?:your|his) (?:resume|information)/,
      /position has been filled/,
    ])
  ) {
    return "rejection";
  }

  if (
    includesAny(text, [
      /phone screen/,
      /screening call/,
      /schedule (?:a )?(?:call|conversation|interview)/,
      /availability/,
      /recruiter/,
      /talent acquisition/,
      /interview/,
    ])
  ) {
    return "recruiter_screen";
  }

  if (
    includesAny(text, [
      /happy to (?:chat|talk|connect|discuss)/,
      /let'?s (?:talk|chat|connect|set up)/,
      /would like to (?:talk|chat|connect|discuss)/,
      /sounds (?:interesting|great|good)/,
      /please send (?:your|his) resume/,
      /forward(?:ed|ing)? (?:this|your|his)/,
    ])
  ) {
    return "positive_reply";
  }

  if (includesAny(text, [/apply online/, /submit (?:an )?application/, /careers portal/, /application portal/])) {
    return "apply_online";
  }

  if (includesAny(text, [/referr(?:al|ed)/, /introduc(?:e|tion)/, /connect (?:you|him) with/, /passed (?:this|it) along/])) {
    return "referral";
  }

  if (includesAny(text, [/\?/, /can you/, /could you/, /please confirm/, /follow up/, /circle back/])) {
    return "needs_follow_up";
  }

  if (autoSubmitted || precedence === "list") return "auto_reply";

  return "unknown";
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sentTimes(row: OutreachHistoryRow): Array<{ name: string; value: number }> {
  return [
    { name: "emailed_at", value: parseTime(row.emailed_at) || 0 },
    { name: "sent_at", value: parseTime(row.sent_at) || 0 },
    { name: "printed_at", value: parseTime(row.printed_at) || 0 },
    { name: "updated_at", value: parseTime(row.updated_at) || 0 },
  ].filter((entry) => entry.value > 0);
}

function subjectSimilarity(left: string | null | undefined, right: string | null | undefined): number {
  const a = normalizeSubject(left).split(" ").filter((token) => token.length > 2);
  const b = normalizeSubject(right).split(" ").filter((token) => token.length > 2);
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  const intersection = Array.from(aSet).filter((token) => bSet.has(token)).length;
  const unionSet = new Set(a);
  for (const token of b) unionSet.add(token);
  const union = unionSet.size;
  return union === 0 ? 0 : intersection / union;
}

export function inferOutreachChannel(row: OutreachHistoryRow): "email" | "letter" | "unknown" {
  if (row.emailed_at) return "email";
  if (row.sent_at || row.printed_at) return "letter";
  return "unknown";
}

export function pickBestOutreach(
  rows: OutreachHistoryRow[],
  receivedAt: string | null | undefined,
  replySubject: string | null | undefined
): MatchedOutreach | null {
  if (rows.length === 0) return null;
  const receivedMs = parseTime(receivedAt) || Date.now();
  let best: { row: OutreachHistoryRow; score: number; matchedBy: string } | null = null;

  for (const row of rows) {
    let score = 0;
    let matchedBy = "contact_email";
    const times = sentTimes(row);
    const pastTimes = times.filter((entry) => entry.value <= receivedMs + 24 * 60 * 60 * 1000);
    const closest = pastTimes.sort((a, b) => Math.abs(receivedMs - b.value) - Math.abs(receivedMs - a.value)).pop();

    if (closest) {
      const daysAgo = Math.max(0, (receivedMs - closest.value) / (24 * 60 * 60 * 1000));
      score += 120 - Math.min(daysAgo, 120);
      matchedBy = closest.name;
    }

    const similarity = subjectSimilarity(row.subject_final, replySubject);
    if (similarity > 0) {
      score += similarity * 50;
      matchedBy = `${matchedBy}+subject`;
    }

    if (row.emailed_at) score += 10;
    if (row.sent_at || row.printed_at) score += 5;

    if (!best || score > best.score) best = { row, score, matchedBy };
  }

  return best
    ? {
        row: best.row,
        matchedBy: best.matchedBy,
        channel: inferOutreachChannel(best.row),
      }
    : null;
}

export function isActionableReply(classification: ReplyClassification): boolean {
  return [
    "positive_reply",
    "recruiter_screen",
    "apply_online",
    "referral",
    "needs_follow_up",
  ].includes(classification);
}

export function redactEmail(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) return normalized || null;
  const [local, domain] = normalized.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}
