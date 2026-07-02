import { warnWrite } from "@/lib/dbGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isDirectJobUrl } from "@/lib/jobLinks";
import { finishSyncRun, startSyncRun } from "@/lib/syncRunStore";
import { isCareerIngestTargetNiche, isExcludedStaffingCompany, normalizeNiche, scoreTargetRole } from "@/lib/targeting";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FETCH_TIMEOUT_MS = 8000;
const DEFAULT_COMPANY_LIMIT = 300;
const MAX_COMPANY_LIMIT = 500;
const COMPANY_FETCH_CONCURRENCY = 8;
const CLOSED_POSTING_TEXT = /\b(?:job is no longer available|position has been filled|posting has expired|job has expired|no longer accepting applications|this job is closed|page not found)\b/i;
// A bare "404" matches asset hashes and SPA bundle noise, so it only counts
// when adjacent to an error phrase (e.g. "404 - Not Found", "Error 404") in
// the visible page text.
const NOT_FOUND_404_TEXT = /\b404\b[^a-z0-9]{0,10}(?:error|not\s+found|page)|\b(?:error|page)[^a-z0-9]{0,10}404\b/i;

type DirectCareerSource = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable" | "workday" | "oracle" | "icims" | "jsonld" | "career_links";
type AggregateJobSource = "builtin_colorado" | "governmentjobs_direct" | "usajobs";
type JobSource = DirectCareerSource | AggregateJobSource;

interface WorkdayToken {
  host: string;
  tenant: string;
  site: string;
  publicBase: string;
}

interface OracleToken {
  host: string;
  siteNumber: string;
  publicBase: string;
}

interface CompanyRow {
  id: number | null;
  companyname: string;
  city: string | null;
  niche: string | null;
  careers_url: string | null;
}

interface CareerJob {
  title: string;
  companyname: string;
  location: string;
  job_url: string;
  source: JobSource;
  external_job_key: string;
  description?: string;
  employment_type?: string;
  salary?: string;
  raw?: unknown;
}

function checkSecret(req: NextRequest): boolean {
  // Accept a match against ANY configured secret. The old
  // `INGEST || IMPORT || CRON` chain compared only the first configured
  // value, so the Vercel cron (Bearer CRON_SECRET) was silently 403'd
  // whenever INGEST_SECRET or IMPORT_SECRET was set to something else.
  const secrets = [
    process.env.INGEST_SECRET,
    process.env.IMPORT_SECRET,
    process.env.CRON_SECRET,
  ].filter((s): s is string => Boolean(s));
  if (secrets.length === 0) return false;
  const provided = req.headers.get("x-cron-secret") || req.headers.get("x-import-secret") || req.headers.get("authorization")?.replace("Bearer ", "") || "";
  return secrets.includes(provided);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function contentKey(source: string, company: string, title: string, url: string, location: string): string {
  return "career_" + createHash("sha256")
    .update([source, company, title, url, location].join("|").toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

function absoluteUrl(url: string, base: string): string {
  try { return new URL(url, base).toString(); } catch { return url; }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(input: string): string {
  return decodeHtmlEntities(input).replace(/\s+/g, " ").trim();
}

function dbSourceFor(source: JobSource): string {
  if (source === "builtin_colorado" || source === "governmentjobs_direct" || source === "usajobs") return source;
  return `${source}_careers`;
}

function friendlySource(source: JobSource): string {
  if (source === "builtin_colorado") return "Built In Colorado";
  if (source === "governmentjobs_direct") return "GovernmentJobs";
  if (source === "usajobs") return "USAJOBS";
  return `${source} careers`;
}

function inferCity(location?: string | null): string {
  const loc = location || "";
  const match = loc.match(/\b(Denver|Lakewood|Golden|Boulder|Littleton|Englewood|Arvada|Aurora|Broomfield|Westminster|Centennial|Longmont|Louisville|Lafayette|Highlands Ranch|Greenwood Village|Colorado Springs)\b/i);
  return match ? match[1] : "Denver";
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Kohler Outreach Engine job monitor",
        accept: "text/html,application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const text = await fetchText(url);
  return JSON.parse(text) as T;
}

async function fetchJsonPost<T>(url: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "user-agent": "Kohler Outreach Engine job monitor",
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

// "closed" means the page fetched OK and shows closure text. "unknown" means
// the fetch errored/timed out/returned non-200 — transient failures used to
// return false here and the caller flipped live rows to ingest_status:"closed",
// making jobs vanish overnight. Only confirmed closures may close a row.
async function checkPostingUrl(url: string): Promise<"active" | "closed" | "unknown"> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      text = await fetchText(url);
    } catch {
      continue; // one retry on fetch failure
    }
    // Strip scripts/styles/markup so closure text must appear in the
    // visible-ish page text, not inside a JS bundle.
    const visible = stripHtml(text);
    if (CLOSED_POSTING_TEXT.test(visible) || NOT_FOUND_404_TEXT.test(visible)) return "closed";
    return "active";
  }
  return "unknown";
}

function stripHtml(input: string): string {
  return cleanText(input.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
  );
}

function detectBoardTokens(url: string, html: string): {
  greenhouse?: string;
  lever?: string;
  ashby?: string;
  smartrecruiters?: string;
  workable?: string;
  workday?: WorkdayToken;
  oracle?: OracleToken;
  icims?: string;
} {
  const combined = `${url}\n${html}`;
  const workdaySite = combined.match(/https?:\/\/([^"'\s]+?\.myworkdaysite\.com)\/(?:[a-z]{2}-[A-Z]{2}\/)?recruiting\/([^\/"'\s]+)\/([^\/"'\s?#]+)/i);
  const workdayJobs = combined.match(/https?:\/\/([^"'\s]+?\.myworkdayjobs\.com)\/(?:[a-z]{2}-[A-Z]{2}\/)?([^\/"'\s?#]+)/i);
  const workday = workdaySite
    ? {
        host: workdaySite[1],
        tenant: workdaySite[2],
        site: workdaySite[3],
        publicBase: `https://${workdaySite[1]}/en-US/recruiting/${workdaySite[2]}/${workdaySite[3]}`,
      }
    : workdayJobs
      ? {
          host: workdayJobs[1],
          tenant: workdayJobs[1].split(".")[0],
          site: workdayJobs[2],
          publicBase: `https://${workdayJobs[1]}/en-US/${workdayJobs[2]}`,
      }
      : undefined;
  const oracleMatch = combined.match(/https?:\/\/([^"'\s]+?\.oraclecloud\.com)\/hcmUI\/CandidateExperience\/(?:[^"'\s]+?\/)?sites\/(CX_\d+)/i);
  const oracle = oracleMatch
    ? {
        host: oracleMatch[1],
        siteNumber: oracleMatch[2],
        publicBase: `https://${oracleMatch[1]}/hcmUI/CandidateExperience/en/sites/${oracleMatch[2]}/requisitions/preview`,
      }
    : undefined;
  return {
    greenhouse: combined.match(/boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/)?([a-z0-9_-]+)/i)?.[1]
      || combined.match(/job-boards\.greenhouse\.io\/([a-z0-9_-]+)/i)?.[1],
    lever: combined.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i)?.[1]
      || combined.match(/api\.lever\.co\/v0\/postings\/([a-z0-9_-]+)/i)?.[1],
    ashby: combined.match(/jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i)?.[1],
    smartrecruiters: combined.match(/jobs\.smartrecruiters\.com\/([a-z0-9_-]+)/i)?.[1]
      || combined.match(/api\.smartrecruiters\.com\/v1\/companies\/([a-z0-9_-]+)/i)?.[1],
    workable: combined.match(/apply\.workable\.com\/([a-z0-9_-]+)/i)?.[1],
    workday,
    oracle,
    icims: combined.match(/https?:\/\/([^"'\s]+?\.icims\.com)\/jobs(?:\/search)?/i)?.[1],
  };
}

function knownOracleTokenFor(company: CompanyRow): OracleToken | undefined {
  if (!(/\bwsp\b/i.test(company.companyname) || /wsp\.com/i.test(company.careers_url || ""))) return undefined;
  return {
    host: "emit.fa.ca3.oraclecloud.com",
    siteNumber: "CX_2001",
    publicBase: "https://emit.fa.ca3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2001/requisitions/preview",
  };
}

function knownWorkdayTokenFor(company: CompanyRow): WorkdayToken | undefined {
  if (!(/\bcoorstek\b/i.test(company.companyname) || /coorstek\.com/i.test(company.careers_url || ""))) return undefined;
  return {
    host: "coorstek.wd1.myworkdayjobs.com",
    tenant: "coorstek",
    site: "CoorsTekCareers",
    publicBase: "https://coorstek.wd1.myworkdayjobs.com/en-US/CoorsTekCareers",
  };
}

async function fromGreenhouse(board: string, company: CompanyRow): Promise<CareerJob[]> {
  const data = await fetchJson<{ jobs?: Array<{ id?: number; title?: string; absolute_url?: string; location?: { name?: string }; content?: string; metadata?: unknown[] }> }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`
  );
  return (data.jobs || []).map((job) => ({
    title: job.title || "",
    companyname: company.companyname,
    location: job.location?.name || company.city || "",
    job_url: job.absolute_url || `https://boards.greenhouse.io/${board}/jobs/${job.id || ""}`,
    source: "greenhouse" as const,
    external_job_key: contentKey("greenhouse", company.companyname, job.title || "", String(job.id || job.absolute_url || ""), job.location?.name || ""),
    description: stripHtml(job.content || ""),
    raw: { id: job.id, board },
  })).filter((job) => job.title && job.job_url);
}

async function fromLever(site: string, company: CompanyRow): Promise<CareerJob[]> {
  const data = await fetchJson<Array<{ id?: string; text?: string; hostedUrl?: string; categories?: { location?: string; commitment?: string; team?: string }; descriptionPlain?: string }>>(
    `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`
  );
  return data.map((job) => ({
    title: job.text || "",
    companyname: company.companyname,
    location: job.categories?.location || company.city || "",
    employment_type: job.categories?.commitment || "",
    job_url: job.hostedUrl || `https://jobs.lever.co/${site}/${job.id || ""}`,
    source: "lever" as const,
    external_job_key: contentKey("lever", company.companyname, job.text || "", job.id || job.hostedUrl || "", job.categories?.location || ""),
    description: job.descriptionPlain || "",
    raw: { id: job.id, site, team: job.categories?.team },
  })).filter((job) => job.title && job.job_url);
}

async function fromAshby(board: string, company: CompanyRow): Promise<CareerJob[]> {
  const data = await fetchJson<{ jobs?: Array<{ id?: string; title?: string; location?: string; jobUrl?: string; descriptionHtml?: string }> }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`
  );
  return (data.jobs || []).map((job) => ({
    title: job.title || "",
    companyname: company.companyname,
    location: job.location || company.city || "",
    job_url: job.jobUrl || `https://jobs.ashbyhq.com/${board}/${job.id || ""}`,
    source: "ashby" as const,
    external_job_key: contentKey("ashby", company.companyname, job.title || "", job.id || job.jobUrl || "", job.location || ""),
    description: stripHtml(job.descriptionHtml || ""),
    raw: { id: job.id, board },
  })).filter((job) => job.title && job.job_url);
}

async function fromSmartRecruiters(companyToken: string, company: CompanyRow): Promise<CareerJob[]> {
  const data = await fetchJson<{ content?: Array<{ id?: string; name?: string; releasedDate?: string; location?: { city?: string; region?: string; country?: string }; ref?: string }> }>(
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyToken)}/postings?limit=100`
  );
  return (data.content || []).map((job) => {
    const location = [job.location?.city, job.location?.region || job.location?.country].filter(Boolean).join(", ");
    return {
      title: job.name || "",
      companyname: company.companyname,
      location: location || company.city || "",
      job_url: job.ref || `https://jobs.smartrecruiters.com/${companyToken}/${job.id || ""}`,
      source: "smartrecruiters" as const,
      external_job_key: contentKey("smartrecruiters", company.companyname, job.name || "", job.id || job.ref || "", location),
      raw: { id: job.id, companyToken },
    };
  }).filter((job) => job.title && job.job_url);
}

async function fromWorkable(account: string, company: CompanyRow): Promise<CareerJob[]> {
  const data = await fetchJson<{ jobs?: Array<{ title?: string; shortcode?: string; url?: string; location?: { location_str?: string }; description?: string }> }>(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}/jobs`
  );
  return (data.jobs || []).map((job) => ({
    title: job.title || "",
    companyname: company.companyname,
    location: job.location?.location_str || company.city || "",
    job_url: job.url || `https://apply.workable.com/${account}/j/${job.shortcode || ""}`,
    source: "workable" as const,
    external_job_key: contentKey("workable", company.companyname, job.title || "", job.shortcode || job.url || "", job.location?.location_str || ""),
    description: stripHtml(job.description || ""),
    raw: { shortcode: job.shortcode, account },
  })).filter((job) => job.title && job.job_url);
}

interface WorkdayJobPosting {
  title?: string;
  locationsText?: string;
  externalPath?: string;
  bulletFields?: string[];
  postedOn?: string;
}

const WORKDAY_SEARCH_TERMS = [
  "engineer",
  "mechanical",
  "electrical",
  "manufacturing",
  "process",
  "quality",
  "test",
  "systems",
  "controls",
  "automation",
  "civil",
  "environmental",
  "water",
  "associate",
  "entry",
];
const WORKDAY_LIMIT = 20;

async function fetchWorkdayPostings(endpoint: string): Promise<WorkdayJobPosting[]> {
  const postings: WorkdayJobPosting[] = [];
  const seen = new Set<string>();
  const addPostings = (jobs: WorkdayJobPosting[] = []) => {
    for (const job of jobs) {
      const key = `${job.externalPath || ""}:${job.title || ""}`.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      postings.push(job);
    }
  };
  let total = 0;

  try {
    const data = await fetchJsonPost<{ total?: number; jobPostings?: WorkdayJobPosting[] }>(
      endpoint,
      { appliedFacets: {}, limit: WORKDAY_LIMIT, offset: 0, searchText: "" }
    );
    total = Number(data.total || 0);
    addPostings(data.jobPostings || []);
  } catch { /* fall back to targeted searches */ }

  if (postings.length === 0 || total > postings.length) {
    for (const term of WORKDAY_SEARCH_TERMS) {
      try {
        const data = await fetchJsonPost<{ jobPostings?: WorkdayJobPosting[] }>(
          endpoint,
          { appliedFacets: {}, limit: WORKDAY_LIMIT, offset: 0, searchText: term }
        );
        addPostings(data.jobPostings || []);
      } catch {
        continue;
      }
    }
  }

  return postings;
}

async function fromWorkday(token: WorkdayToken, company: CompanyRow): Promise<CareerJob[]> {
  const endpoint = `https://${token.host}/wday/cxs/${encodeURIComponent(token.tenant)}/${encodeURIComponent(token.site)}/jobs`;
  const postings = await fetchWorkdayPostings(endpoint);

  return postings.map((job) => {
    const url = job.externalPath
      ? `${token.publicBase}${job.externalPath.startsWith("/") ? job.externalPath : `/${job.externalPath}`}`
      : token.publicBase;
    return {
      title: job.title || "",
      companyname: company.companyname,
      location: job.locationsText || company.city || "",
      employment_type: Array.isArray(job.bulletFields) ? job.bulletFields.join(", ") : "",
      job_url: url,
      source: "workday" as const,
      external_job_key: contentKey("workday", company.companyname, job.title || "", job.externalPath || url, job.locationsText || ""),
      raw: { postedOn: job.postedOn, tenant: token.tenant, site: token.site },
    };
  }).filter((job) => job.title && job.job_url);
}

const ORACLE_SEARCH_TERMS = [
  "Denver",
  "Lakewood",
  "Colorado",
  "early career engineer",
  "entry level engineer",
  "mechanical engineer",
  "electrical engineer",
  "civil engineer",
  "geotechnical engineer",
  "water engineer",
  "environmental engineer",
  "project engineer",
];

interface OracleSearchResponse {
  items?: Array<{
    requisitionList?: Array<{
      Id?: string | number;
      Title?: string;
      PrimaryLocation?: string;
      ShortDescriptionStr?: string;
      ExternalDescriptionStr?: string;
      secondaryLocations?: Array<{ Name?: string }>;
    }>;
  }>;
}

function oracleSearchUrl(token: OracleToken, term: string): string {
  const finder = `findReqs;siteNumber=${token.siteNumber},limit=100,offset=0,keyword="${term.replace(/"/g, "")}"`;
  const params = new URLSearchParams({
    onlyData: "true",
    expand: "requisitionList.secondaryLocations",
    finder,
  });
  return `https://${token.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?${params.toString()}`;
}

async function fromOracle(token: OracleToken, company: CompanyRow): Promise<CareerJob[]> {
  const jobs: CareerJob[] = [];
  const seen = new Set<string>();

  for (const term of ORACLE_SEARCH_TERMS) {
    let data: OracleSearchResponse;
    try {
      data = await fetchJson<OracleSearchResponse>(oracleSearchUrl(token, term));
    } catch {
      continue;
    }
    for (const item of data.items || []) {
      for (const job of item.requisitionList || []) {
        const id = String(job.Id || "");
        if (!id || !job.Title || seen.has(id)) continue;
        seen.add(id);
        const secondary = (job.secondaryLocations || []).map((loc) => loc.Name).filter(Boolean) as string[];
        const location = [job.PrimaryLocation, ...secondary].filter(Boolean).join(" | ") || company.city || "";
        jobs.push({
          title: job.Title,
          companyname: company.companyname,
          location,
          job_url: `${token.publicBase}/${encodeURIComponent(id)}`,
          source: "oracle" as const,
          external_job_key: `oracle_${token.host}_${token.siteNumber}_${id}`,
          description: stripHtml([job.ShortDescriptionStr, job.ExternalDescriptionStr].filter(Boolean).join(" ")),
          raw: { id, siteNumber: token.siteNumber, searchTerm: term },
        });
      }
    }
  }

  return jobs;
}

async function fromIcims(host: string, company: CompanyRow): Promise<CareerJob[]> {
  const html = await fetchText(`https://${host}/jobs/search?ss=1&pr=0`);
  const jobs: CareerJob[] = [];
  const seen = new Set<string>();
  const anchors = html.match(/<a\s+[^>]*href=["'][^"']*\/jobs\/\d+\/[^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || [];

  for (const anchor of anchors) {
    const href = anchor.match(/href=["']([^"']+)["']/i)?.[1] || "";
    const title = stripHtml(anchor).replace(/\s+Apply\s*$/i, "").trim();
    if (!href || !title || seen.has(href)) continue;
    const url = absoluteUrl(href, `https://${host}`);
    seen.add(href);
    jobs.push({
      title: title.slice(0, 180),
      companyname: company.companyname,
      location: company.city || "",
      job_url: url,
      source: "icims" as const,
      external_job_key: contentKey("icims", company.companyname, title, url, company.city || ""),
      raw: { host },
    });
  }

  return jobs;
}

function fromJsonLd(html: string, baseUrl: string, company: CompanyRow): CareerJob[] {
  const jobs: CareerJob[] = [];
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const jsonText = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(jsonText);
      const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [])];
      for (const item of candidates) {
        const type = item?.["@type"];
        const isJobPosting = type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
        if (!item || !isJobPosting) continue;
        const loc = item.jobLocation?.address
          ? [item.jobLocation.address.addressLocality, item.jobLocation.address.addressRegion].filter(Boolean).join(", ")
          : company.city || "";
        const url = absoluteUrl(item.url || item.identifier?.value || baseUrl, baseUrl);
        jobs.push({
          title: item.title || "",
          companyname: company.companyname,
          location: loc,
          employment_type: Array.isArray(item.employmentType) ? item.employmentType.join(", ") : item.employmentType || "",
          job_url: url,
          source: "jsonld" as const,
          external_job_key: contentKey("jsonld", company.companyname, item.title || "", url, loc),
          description: stripHtml(item.description || ""),
          raw: { datePosted: item.datePosted, validThrough: item.validThrough },
        });
      }
    } catch { /* ignore malformed JSON-LD */ }
  }
  return jobs.filter((job) => job.title && job.job_url);
}

function fromCareerLinks(html: string, baseUrl: string, company: CompanyRow): CareerJob[] {
  const links = html.match(/<a\s+[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || [];
  const jobs: CareerJob[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const href = link.match(/href=["']([^"']+)["']/i)?.[1] || "";
    const text = stripHtml(link);
    if (!href || !text || seen.has(href)) continue;
    if (!/(engineer|eit|mechanical|hvac|mep|project|tooling|test|validation|manufacturing|thermal|aerospace|space|robotics)/i.test(text)) continue;
    const url = absoluteUrl(href, baseUrl);
    if (/linkedin\.com\/jobs\/(?!view\/)/i.test(url)) continue;
    if (!/(job|career|opening|posting|position|requisition|greenhouse|lever|ashby|workday|icims|smartrecruiters|workable)/i.test(url)) continue;
    seen.add(href);
    jobs.push({
      title: text.slice(0, 180),
      companyname: company.companyname,
      location: company.city || "",
      job_url: url,
      source: "career_links" as const,
      external_job_key: contentKey("career_links", company.companyname, text, url, company.city || ""),
      raw: { baseUrl },
    });
  }
  return jobs;
}

const BUILTIN_COLORADO_SEARCH_URLS = [
  "https://www.builtincolorado.com/jobs/dev-engineering/search/mechanical-engineer",
  "https://www.builtincolorado.com/jobs/dev-engineering/search/mechanical-design-engineer",
  "https://www.builtincolorado.com/jobs/dev-engineering/search/manufacturing-engineer",
  "https://www.builtincolorado.com/jobs/dev-engineering/search/aerospace-engineer",
  "https://www.builtincolorado.com/jobs/dev-engineering/search/robotics-engineer",
  "https://www.builtincolorado.com/jobs/dev-engineering/search/hvac-engineer",
];

function getAttr(fragment: string, attr: string): string {
  return fragment.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"))?.[1] || "";
}

function iconText(block: string, iconClass: string): string {
  const match = block.match(new RegExp(`${iconClass}[\\s\\S]{0,900}?<span[^>]*>([\\s\\S]*?)<\\/span>`, "i"));
  return match ? stripHtml(match[1]) : "";
}

function fromBuiltInColoradoHtml(html: string, sourceUrl: string): CareerJob[] {
  const jobs: CareerJob[] = [];
  const cardRegex = /<div\s+id=["']job-card-(\d+)["'][\s\S]*?(?=<div\s+id=["']job-card-\d+["']|<nav|<footer|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html)) !== null) {
    const [, id] = match;
    const block = match[0];
    const titleAnchor = block.match(/<a\s+[^>]*data-id=["']job-card-title["'][^>]*>[\s\S]*?<\/a>/i)?.[0]
      || block.match(/<a\s+[^>]*href=["'][^"']+["'][^>]*data-id=["']job-card-title["'][^>]*>[\s\S]*?<\/a>/i)?.[0]
      || "";
    const href = getAttr(titleAnchor, "href");
    const title = stripHtml(titleAnchor);
    const companyBlock = block.match(/data-id=["']company-title["'][^>]*>([\s\S]*?)<\/(?:div|a)>/i)?.[1] || "";
    const companyname = stripHtml(companyBlock);
    const location = iconText(block, "fa-location-dot")
      || stripHtml(block.match(/data-bs-title=["']([^"']*(?:CO|Colorado)[^"']*)["']/i)?.[1] || "")
      || "Denver, CO";
    const level = iconText(block, "fa-trophy");
    const salary = iconText(block, "fa-sack-dollar");
    const description = stripHtml(block.match(/class=["'][^"']*text-gray-04[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] || "");
    const url = href ? absoluteUrl(href, "https://www.builtincolorado.com") : sourceUrl;

    if (!title || !companyname || !url) continue;
    jobs.push({
      title: title.slice(0, 180),
      companyname,
      location,
      salary,
      job_url: url,
      source: "builtin_colorado",
      external_job_key: id ? `builtin_colorado_${id}` : contentKey("builtin_colorado", companyname, title, url, location),
      description: [level, description].filter(Boolean).join(". "),
      raw: { id, sourceUrl, level },
    });
  }

  return jobs;
}

async function fetchBuiltInColoradoJobs(): Promise<{ jobs: CareerJob[]; warnings: string[] }> {
  const jobs: CareerJob[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const url of BUILTIN_COLORADO_SEARCH_URLS) {
    try {
      const html = await fetchText(url);
      for (const job of fromBuiltInColoradoHtml(html, url)) {
        const key = job.job_url.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        jobs.push(job);
      }
    } catch (err) {
      warnings.push(`builtin_colorado ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { jobs, warnings };
}

const GOVERNMENTJOBS_SEARCHES: Array<{ agency: string; companyname: string }> = [
  { agency: "colorado", companyname: "State of Colorado" },
  { agency: "denver", companyname: "City and County of Denver" },
  { agency: "aurora", companyname: "City of Aurora" },
  { agency: "lakewood", companyname: "City of Lakewood" },
  { agency: "arvada", companyname: "City of Arvada" },
  { agency: "boulder", companyname: "City of Boulder" },
  { agency: "broomfield", companyname: "City and County of Broomfield" },
  { agency: "jeffco", companyname: "Jefferson County" },
  { agency: "rtd", companyname: "Regional Transportation District" },
];

function fromGovernmentJobsHtml(html: string, agency: string, companyname: string, sourceUrl: string): CareerJob[] {
  const anchors = html.match(/<a\s+[^>]*href=["'][^"']*\/careers\/[^/"']+\/jobs\/\d+[^"']*["'][^>]*>[\s\S]*?<\/a>/gi) || [];
  const jobs: CareerJob[] = [];
  const seen = new Set<string>();

  for (const anchor of anchors) {
    const href = getAttr(anchor, "href");
    const jobId = href.match(/\/jobs\/(\d+)/i)?.[1] || "";
    if (!href || !jobId || seen.has(jobId)) continue;
    seen.add(jobId);

    const title = stripHtml(anchor).replace(/\b(apply|view details|view job)\b/gi, "").trim();
    if (!title || title.length < 4) continue;

    const url = absoluteUrl(href, "https://www.governmentjobs.com");
    jobs.push({
      title: title.slice(0, 180),
      companyname,
      location: "Colorado",
      job_url: url,
      source: "governmentjobs_direct",
      external_job_key: `governmentjobs_${agency}_${jobId}`,
      description: `${companyname} public-sector engineering role from GovernmentJobs.`,
      raw: { agency, jobId, sourceUrl },
    });
  }

  return jobs;
}

async function fetchGovernmentJobsDirect(): Promise<{ jobs: CareerJob[]; warnings: string[] }> {
  const jobs: CareerJob[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const search of GOVERNMENTJOBS_SEARCHES) {
    const url = `https://www.governmentjobs.com/careers/${encodeURIComponent(search.agency)}?keyword=engineer`;
    try {
      const html = await fetchText(url);
      for (const job of fromGovernmentJobsHtml(html, search.agency, search.companyname, url)) {
        if (seen.has(job.external_job_key)) continue;
        seen.add(job.external_job_key);
        jobs.push(job);
      }
    } catch (err) {
      warnings.push(`governmentjobs_direct ${search.agency}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { jobs, warnings };
}

interface UsaJobsResponse {
  SearchResult?: {
    SearchResultItems?: Array<{
      MatchedObjectDescriptor?: {
        PositionID?: string;
        PositionTitle?: string;
        PositionURI?: string;
        OrganizationName?: string;
        PositionLocationDisplay?: string;
        PositionSchedule?: Array<{ Name?: string }>;
        PositionRemuneration?: Array<{ MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string; Description?: string }>;
        UserArea?: {
          Details?: {
            JobSummary?: string;
            MajorDuties?: string[] | string;
            Requirements?: string;
          };
        };
      };
    }>;
  };
}

function formatUsaJobsSalary(remuneration?: Array<{ MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string; Description?: string }>): string {
  const item = remuneration?.[0];
  if (!item) return "";
  if (item.Description) return item.Description;
  const min = item.MinimumRange ? `$${Number(item.MinimumRange).toLocaleString("en-US")}` : "";
  const max = item.MaximumRange ? `$${Number(item.MaximumRange).toLocaleString("en-US")}` : "";
  const range = [min, max].filter(Boolean).join(" - ");
  return item.RateIntervalCode ? `${range} ${item.RateIntervalCode}`.trim() : range;
}

async function fetchUsaJobs(): Promise<{ jobs: CareerJob[]; warnings: string[] }> {
  const key = process.env.USAJOBS_AUTHORIZATION_KEY || process.env.USAJOBS_API_KEY;
  const userAgent = process.env.USAJOBS_USER_AGENT || process.env.USAJOBS_EMAIL;
  if (!key || !userAgent) {
    return { jobs: [], warnings: ["usajobs not configured: set USAJOBS_AUTHORIZATION_KEY and USAJOBS_USER_AGENT or USAJOBS_EMAIL"] };
  }

  const keywords = ["Mechanical Engineer", "Engineer In Training", "General Engineer", "Aerospace Engineer", "Civil Engineer"];
  const jobs: CareerJob[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const keyword of keywords) {
    const params = new URLSearchParams({
      Keyword: keyword,
      LocationName: "Denver, Colorado",
      Radius: "50",
      ResultsPerPage: "50",
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`https://data.usajobs.gov/api/search?${params.toString()}`, {
        signal: controller.signal,
        headers: {
          Host: "data.usajobs.gov",
          "User-Agent": userAgent,
          "Authorization-Key": key,
          accept: "application/json",
        },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json() as UsaJobsResponse;
      for (const item of data.SearchResult?.SearchResultItems || []) {
        const job = item.MatchedObjectDescriptor;
        if (!job?.PositionTitle || !job.PositionURI) continue;
        const key = job.PositionID || job.PositionURI;
        if (seen.has(key)) continue;
        seen.add(key);
        const majorDuties = Array.isArray(job.UserArea?.Details?.MajorDuties)
          ? job.UserArea?.Details?.MajorDuties.join(" ")
          : job.UserArea?.Details?.MajorDuties || "";
        jobs.push({
          title: job.PositionTitle,
          companyname: job.OrganizationName || "USAJOBS Federal Agency",
          location: job.PositionLocationDisplay || "Denver, CO",
          employment_type: job.PositionSchedule?.map((schedule) => schedule.Name).filter(Boolean).join(", ") || "",
          salary: formatUsaJobsSalary(job.PositionRemuneration),
          job_url: job.PositionURI,
          source: "usajobs",
          external_job_key: `usajobs_${key}`,
          description: [job.UserArea?.Details?.JobSummary, majorDuties, job.UserArea?.Details?.Requirements].filter(Boolean).join(" "),
          raw: { positionId: job.PositionID, keyword },
        });
      }
    } catch (err) {
      warnings.push(`usajobs ${keyword}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  return { jobs, warnings };
}

async function fetchCareerJobs(company: CompanyRow): Promise<{ jobs: CareerJob[]; sources: DirectCareerSource[]; warnings: string[] }> {
  const warnings: string[] = [];
  const sources: DirectCareerSource[] = [];
  const careersUrl = company.careers_url || "";
  if (!careersUrl) return { jobs: [], sources, warnings: ["no careers_url"] };
  const knownOracle = knownOracleTokenFor(company);
  const knownWorkday = knownWorkdayTokenFor(company);

  let html = "";
  try {
    html = await fetchText(careersUrl);
  } catch (err) {
    warnings.push(`careers_url fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    if (!knownOracle && !knownWorkday) return { jobs: [], sources, warnings };
  }

  const tokens = detectBoardTokens(careersUrl, html);
  if (knownOracle && !tokens.oracle) tokens.oracle = knownOracle;
  if (knownWorkday && !tokens.workday) tokens.workday = knownWorkday;
  const jobs: CareerJob[] = [];

  const attempts: Array<[DirectCareerSource, () => Promise<CareerJob[]>]> = [];
  if (tokens.greenhouse) attempts.push(["greenhouse", () => fromGreenhouse(tokens.greenhouse!, company)]);
  if (tokens.lever) attempts.push(["lever", () => fromLever(tokens.lever!, company)]);
  if (tokens.ashby) attempts.push(["ashby", () => fromAshby(tokens.ashby!, company)]);
  if (tokens.smartrecruiters) attempts.push(["smartrecruiters", () => fromSmartRecruiters(tokens.smartrecruiters!, company)]);
  if (tokens.workable) attempts.push(["workable", () => fromWorkable(tokens.workable!, company)]);
  if (tokens.workday) attempts.push(["workday", () => fromWorkday(tokens.workday!, company)]);
  if (tokens.oracle) attempts.push(["oracle", () => fromOracle(tokens.oracle!, company)]);
  if (tokens.icims) attempts.push(["icims", () => fromIcims(tokens.icims!, company)]);

  for (const [source, fetcher] of attempts) {
    try {
      const found = await fetcher();
      if (found.length > 0) {
        sources.push(source);
        jobs.push(...found);
      }
    } catch (err) {
      warnings.push(`${source}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (jobs.length === 0) {
    const jsonLdJobs = fromJsonLd(html, careersUrl, company);
    if (jsonLdJobs.length > 0) sources.push("jsonld");
    jobs.push(...jsonLdJobs);
  }

  if (jobs.length === 0) {
    const linkJobs = fromCareerLinks(html, careersUrl, company);
    if (linkJobs.length > 0) sources.push("career_links");
    jobs.push(...linkJobs);
  }

  return { jobs, sources, warnings };
}

async function closeExistingJob(job: CareerJob): Promise<void> {
  const source = dbSourceFor(job.source);
  warnWrite(
    `careers: close job ${job.external_job_key}`,
    await supabaseAdmin
      .from("job_listings")
      .update({ ingest_status: "closed", last_seen_at: new Date().toISOString() })
      .eq("source", source)
      .eq("external_job_key", job.external_job_key)
  );
}

type UpsertAction = "inserted" | "updated" | "dry_run" | "skipped" | "write_error";

async function upsertJob(job: CareerJob, company: CompanyRow, dryRun: boolean): Promise<UpsertAction> {
  const relevance = scoreTargetRole(job.title, job.location, job.description);
  if (!relevance.is_relevant) return "skipped";
  if (!isDirectJobUrl(job.job_url)) return "skipped";
  const liveness = await checkPostingUrl(job.job_url);
  if (liveness === "closed") {
    if (!dryRun) await closeExistingJob(job);
    return "skipped";
  }
  if (liveness === "unknown") {
    // Couldn't verify the posting — leave any existing row untouched.
    return "skipped";
  }

  if (dryRun) return "dry_run";

  const now = new Date().toISOString();
  const source = dbSourceFor(job.source);
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("job_listings")
    .select("id, times_seen, first_seen_at")
    .eq("source", source)
    .eq("external_job_key", job.external_job_key)
    .maybeSingle();
  if (lookupError) {
    warnWrite(`careers: job lookup ${job.external_job_key}`, { error: lookupError });
    return "write_error";
  }

  if (existing) {
    const updateWarning = warnWrite(
      `careers: job update ${job.external_job_key}`,
      await supabaseAdmin
        .from("job_listings")
        .update({
          last_seen_at: now,
          times_seen: (existing.times_seen || 1) + 1,
          salary: job.salary || undefined,
          employment_type: job.employment_type || undefined,
          job_url: job.job_url,
          is_relevant: relevance.is_relevant,
          match_score: relevance.match_score,
          relevance_reason: relevance.relevance_reason,
          ingest_status: "open",
        })
        .eq("id", existing.id)
    );
    return updateWarning ? "write_error" : "updated";
  }

  const insertWarning = warnWrite(
    `careers: job insert ${job.external_job_key}`,
    await supabaseAdmin.from("job_listings").insert({
      companyname: company.companyname,
      company_id: company.id,
      title: job.title,
      salary: job.salary || null,
      location: job.location || null,
      employment_type: job.employment_type || null,
      source,
      external_job_key: job.external_job_key,
      job_url: job.job_url,
      received_at: now,
      first_seen_at: now,
      last_seen_at: now,
      times_seen: 1,
      is_relevant: relevance.is_relevant,
      match_score: relevance.match_score,
      relevance_reason: relevance.relevance_reason,
      raw_payload: {
        parserVersion: 1,
        source: job.source,
        careersUrl: company.careers_url,
        raw: job.raw || null,
      },
      ingest_status: "new",
      parser_version: 1,
    })
  );
  return insertWarning ? "write_error" : "inserted";
}

async function fetchAggregateJobs(): Promise<{ jobs: CareerJob[]; sources: JobSource[]; warnings: string[] }> {
  const warnings: string[] = [];
  const jobs: CareerJob[] = [];
  const sources = new Set<JobSource>();

  const batches = [
    await fetchBuiltInColoradoJobs(),
  ];
  if (process.env.ENABLE_GOVERNMENT_JOB_SOURCES === "true") {
    batches.push(await fetchGovernmentJobsDirect(), await fetchUsaJobs());
  } else {
    warnings.push("government aggregate job sources disabled; set ENABLE_GOVERNMENT_JOB_SOURCES=true to enable GovernmentJobs/USAJOBS polling");
  }

  const seen = new Set<string>();
  for (const batch of batches) {
    warnings.push(...batch.warnings);
    for (const job of batch.jobs) {
      const key = `${job.source}:${job.external_job_key || job.job_url}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push(job);
      sources.add(job.source);
    }
  }

  return { jobs, sources: Array.from(sources), warnings };
}

async function ensureCompanyForJob(job: CareerJob, dryRun: boolean): Promise<{ company: CompanyRow; created: boolean } | null> {
  if (!job.companyname || isExcludedStaffingCompany(job.companyname)) return null;

  const companyKey = slugify(job.companyname);
  const selectColumns = "id, companyname, city, niche, careers_url";
  const { data: keyMatches, error: keyError } = await supabaseAdmin
    .from("companies")
    .select(selectColumns)
    .eq("company_key", companyKey)
    .limit(1);
  // A failed match lookup must not fall through to insert — that duplicates the company
  if (keyError) throw new Error(`company key lookup failed for ${job.companyname}: ${keyError.message}`);
  const byKey = keyMatches?.[0] as CompanyRow | undefined;
  if (byKey) return { company: byKey, created: false };

  const { data: nameMatches, error: nameError } = await supabaseAdmin
    .from("companies")
    .select(selectColumns)
    .ilike("companyname", job.companyname)
    .limit(1);
  if (nameError) throw new Error(`company name lookup failed for ${job.companyname}: ${nameError.message}`);
  const byName = nameMatches?.[0] as CompanyRow | undefined;
  if (byName) return { company: byName, created: false };

  const titleText = `${job.title} ${job.description || ""}`;
  const niche = normalizeNiche(null, job.companyname, titleText);
  const city = inferCity(job.location);

  if (dryRun) {
    return {
      company: {
        id: null,
        companyname: job.companyname,
        city,
        niche,
        careers_url: null,
      },
      created: true,
    };
  }

  const isGovSource = job.source === "usajobs" || job.source === "governmentjobs_direct";
  const { data: created, error } = await supabaseAdmin
    .from("companies")
    .insert({
      companyname: job.companyname,
      company_key: companyKey,
      city,
      tier: isGovSource || niche === "MEP / HVAC / Building Systems" || niche === "Aerospace / Space" ? 2 : 4,
      niche,
      company_about: `Added from ${friendlySource(job.source)} ingest. Job: ${job.title}`,
    })
    .select(selectColumns)
    .single();

  if (error) throw new Error(`company create failed for ${job.companyname}: ${error.message}`);
  return { company: created as CompanyRow, created: true };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
}

function parseCompanyLimit(value: string | number | undefined): number {
  const parsed = Number(value || DEFAULT_COMPANY_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_COMPANY_LIMIT;
  return Math.min(Math.floor(parsed), MAX_COMPANY_LIMIT);
}

async function runCareersIngest(options: { dryRun: boolean; limit: number; companyname?: string }) {
  const syncRun = await startSyncRun({
    provider: "careers",
    sourceType: options.companyname ? "company_careers" : "careers_all",
    companyname: options.companyname || null,
    triggerType: options.dryRun ? "manual_dry_run" : "manual_or_cron",
    dryRun: options.dryRun,
    metadata: { limit: options.limit },
  });

  try {
  let query = supabaseAdmin
    .from("companies")
    .select("id, companyname, city, niche, careers_url")
    .not("careers_url", "is", null)
    .order("tier", { ascending: true });
  if (options.companyname) query = query.eq("companyname", options.companyname);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const companies = (data || []).filter((company) => {
    const niche = normalizeNiche(company.niche, company.companyname);
    return isCareerIngestTargetNiche(niche) && !isExcludedStaffingCompany(company.companyname);
  }).slice(0, options.limit) as CompanyRow[];

  const summary = {
    dryRun: options.dryRun,
    companies_checked: 0,
    companies_with_jobs: 0,
    aggregate_sources_checked: 0,
    aggregate_companies_created: 0,
    jobs_found: 0,
    jobs_relevant: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    write_errors: 0,
    source_counts: {} as Record<string, number>,
  };
  const results: Array<{ company: string; careers_url: string | null; found: number; relevant: number; actions: Record<string, number>; sources: JobSource[]; warnings: string[]; sample: Array<{ title: string; location: string; url: string; source: string }> }> = [];

  const companyResults = await mapWithConcurrency(companies, COMPANY_FETCH_CONCURRENCY, async (company) => {
    const fetched = await fetchCareerJobs(company);
    const actions: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let writeErrors = 0;
    let relevant = 0;

    for (const job of fetched.jobs) {
      const relevance = scoreTargetRole(job.title, job.location, job.description);
      if (relevance.is_relevant) relevant++;
      const action = await upsertJob(job, company, options.dryRun);
      actions[action] = (actions[action] || 0) + 1;
      if (action === "inserted") inserted++;
      if (action === "updated") updated++;
      if (action === "skipped") skipped++;
      if (action === "dry_run") skipped++;
      if (action === "write_error") writeErrors++;
      sourceCounts[job.source] = (sourceCounts[job.source] || 0) + 1;
    }

    return {
      summary: {
        jobs_found: fetched.jobs.length,
        jobs_relevant: relevant,
        inserted,
        updated,
        skipped,
        write_errors: writeErrors,
        source_counts: sourceCounts,
      },
      result: {
        company: company.companyname,
        careers_url: company.careers_url,
        found: fetched.jobs.length,
        relevant,
        actions,
        sources: fetched.sources,
        warnings: fetched.warnings,
        sample: fetched.jobs.slice(0, 5).map((job) => ({ title: job.title, location: job.location, url: job.job_url, source: job.source })),
      },
    };
  });

  summary.companies_checked = companies.length;
  for (const companyResult of companyResults) {
    if (companyResult.summary.jobs_found > 0) summary.companies_with_jobs++;
    summary.jobs_found += companyResult.summary.jobs_found;
    summary.jobs_relevant += companyResult.summary.jobs_relevant;
    summary.inserted += companyResult.summary.inserted;
    summary.updated += companyResult.summary.updated;
    summary.skipped += companyResult.summary.skipped;
    summary.write_errors += companyResult.summary.write_errors;
    for (const [source, count] of Object.entries(companyResult.summary.source_counts)) {
      summary.source_counts[source] = (summary.source_counts[source] || 0) + count;
    }
    results.push(companyResult.result);
  }

  if (!options.companyname) {
    const aggregate = await fetchAggregateJobs();
    summary.aggregate_sources_checked = aggregate.sources.length;
    const grouped = new Map<string, { jobs: CareerJob[]; actions: Record<string, number>; relevant: number; warnings: string[]; sources: JobSource[]; createdCompany: boolean }>();
    const createdCompanyKeys = new Set<string>();

    for (const job of aggregate.jobs) {
      summary.jobs_found++;
      summary.source_counts[job.source] = (summary.source_counts[job.source] || 0) + 1;
      const relevance = scoreTargetRole(job.title, job.location, job.description);
      if (relevance.is_relevant) summary.jobs_relevant++;

      const companyResult = relevance.is_relevant ? await ensureCompanyForJob(job, options.dryRun) : null;
      let action: UpsertAction = "skipped";
      if (companyResult) {
        const createdKey = slugify(companyResult.company.companyname);
        if (companyResult.created && !createdCompanyKeys.has(createdKey)) {
          createdCompanyKeys.add(createdKey);
          summary.aggregate_companies_created++;
        }
        action = await upsertJob(job, companyResult.company, options.dryRun);
      }

      if (action === "inserted") summary.inserted++;
      if (action === "updated") summary.updated++;
      if (action === "skipped") summary.skipped++;
      if (action === "dry_run") summary.skipped++;
      if (action === "write_error") summary.write_errors++;

      const bucket = grouped.get(job.companyname) || { jobs: [], actions: {}, relevant: 0, warnings: [], sources: [], createdCompany: false };
      bucket.jobs.push(job);
      bucket.actions[action] = (bucket.actions[action] || 0) + 1;
      if (relevance.is_relevant) bucket.relevant++;
      if (!bucket.sources.includes(job.source)) bucket.sources.push(job.source);
      if (companyResult?.created) bucket.createdCompany = true;
      grouped.set(job.companyname, bucket);
    }

    for (const warning of aggregate.warnings) {
      const bucket = grouped.get("_aggregate_warnings") || { jobs: [], actions: {}, relevant: 0, warnings: [], sources: [], createdCompany: false };
      bucket.warnings.push(warning);
      grouped.set("_aggregate_warnings", bucket);
    }

    for (const [company, bucket] of Array.from(grouped.entries())) {
      results.push({
        company,
        careers_url: null,
        found: bucket.jobs.length,
        relevant: bucket.relevant,
        actions: bucket.actions,
        sources: bucket.sources,
        warnings: bucket.warnings,
        sample: bucket.jobs.slice(0, 5).map((job) => ({ title: job.title, location: job.location, url: job.job_url, source: job.source })),
      });
    }
  }

  const warningErrors = results
    .flatMap((result) => result.warnings.map((warning) => ({ company: result.company, warning })))
    .slice(0, 50);
  await finishSyncRun(syncRun, {
    status: warningErrors.length > 0 || summary.write_errors > 0 ? "completed_with_errors" : "completed",
    companiesChecked: summary.companies_checked,
    jobsFound: summary.jobs_found,
    jobsRelevant: summary.jobs_relevant,
    jobsInserted: summary.inserted,
    jobsUpdated: summary.updated,
    jobsSkipped: summary.skipped,
    errors: warningErrors,
    metadata: {
      write_errors: summary.write_errors,
      source_counts: summary.source_counts,
      aggregate_sources_checked: summary.aggregate_sources_checked,
      aggregate_companies_created: summary.aggregate_companies_created,
      persistence: {
        sync_run_id: syncRun.id,
        persisted: syncRun.persisted,
        disabled_reason: syncRun.disabledReason || null,
      },
    },
  });

  return {
    success: true,
    summary,
    results,
    sync_run: {
      id: syncRun.id,
      persisted: syncRun.persisted,
      disabled_reason: syncRun.disabledReason || null,
    },
  };
  } catch (err) {
    await finishSyncRun(syncRun, {
      status: "error",
      errors: [{ message: err instanceof Error ? err.message : String(err) }],
      metadata: {
        persistence: {
          sync_run_id: syncRun.id,
          persisted: syncRun.persisted,
          disabled_reason: syncRun.disabledReason || null,
        },
      },
    });
    throw err;
  }
}

export async function GET(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const limit = parseCompanyLimit(req.nextUrl.searchParams.get("limit") || undefined);
    const companyname = req.nextUrl.searchParams.get("companyname") || undefined;
    const result = await runCareersIngest({ dryRun: false, limit, companyname });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = !!body.dryRun;
  const limit = parseCompanyLimit(body.limit);
  const companyname = typeof body.companyname === "string" ? body.companyname : undefined;

  try {
    const result = await runCareersIngest({ dryRun, limit, companyname });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
