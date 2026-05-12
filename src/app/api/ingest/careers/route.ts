import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isExcludedStaffingCompany, isTodayExcludedNiche, normalizeNiche, scoreTargetRole } from "@/lib/targeting";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AtsSource = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable" | "workday" | "icims" | "jsonld" | "career_links";

interface WorkdayToken {
  host: string;
  tenant: string;
  site: string;
  publicBase: string;
}

interface CompanyRow {
  id: number;
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
  source: AtsSource;
  external_job_key: string;
  description?: string;
  employment_type?: string;
  salary?: string;
  raw?: unknown;
}

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.INGEST_SECRET || process.env.IMPORT_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-cron-secret") || req.headers.get("x-import-secret") || req.headers.get("authorization")?.replace("Bearer ", "") || "";
  return provided === secret;
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

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
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
  const timeout = setTimeout(() => controller.abort(), 12000);
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

function stripHtml(input: string): string {
  return input.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function detectBoardTokens(url: string, html: string): {
  greenhouse?: string;
  lever?: string;
  ashby?: string;
  smartrecruiters?: string;
  workable?: string;
  workday?: WorkdayToken;
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
    icims: combined.match(/https?:\/\/([^"'\s]+?\.icims\.com)\/jobs(?:\/search)?/i)?.[1],
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

async function fromWorkday(token: WorkdayToken, company: CompanyRow): Promise<CareerJob[]> {
  const endpoint = `https://${token.host}/wday/cxs/${encodeURIComponent(token.tenant)}/${encodeURIComponent(token.site)}/jobs`;
  const data = await fetchJsonPost<{ jobPostings?: Array<{ title?: string; locationsText?: string; externalPath?: string; bulletFields?: string[]; postedOn?: string }> }>(
    endpoint,
    { appliedFacets: {}, limit: 100, offset: 0, searchText: "" }
  );

  return (data.jobPostings || []).map((job) => {
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

async function fetchCareerJobs(company: CompanyRow): Promise<{ jobs: CareerJob[]; sources: AtsSource[]; warnings: string[] }> {
  const warnings: string[] = [];
  const sources: AtsSource[] = [];
  const careersUrl = company.careers_url || "";
  if (!careersUrl) return { jobs: [], sources, warnings: ["no careers_url"] };

  let html = "";
  try {
    html = await fetchText(careersUrl);
  } catch (err) {
    return { jobs: [], sources, warnings: [`careers_url fetch failed: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const tokens = detectBoardTokens(careersUrl, html);
  const jobs: CareerJob[] = [];

  const attempts: Array<[AtsSource, () => Promise<CareerJob[]>]> = [];
  if (tokens.greenhouse) attempts.push(["greenhouse", () => fromGreenhouse(tokens.greenhouse!, company)]);
  if (tokens.lever) attempts.push(["lever", () => fromLever(tokens.lever!, company)]);
  if (tokens.ashby) attempts.push(["ashby", () => fromAshby(tokens.ashby!, company)]);
  if (tokens.smartrecruiters) attempts.push(["smartrecruiters", () => fromSmartRecruiters(tokens.smartrecruiters!, company)]);
  if (tokens.workable) attempts.push(["workable", () => fromWorkable(tokens.workable!, company)]);
  if (tokens.workday) attempts.push(["workday", () => fromWorkday(tokens.workday!, company)]);
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

async function upsertJob(job: CareerJob, company: CompanyRow, dryRun: boolean): Promise<"inserted" | "updated" | "dry_run" | "skipped"> {
  const relevance = scoreTargetRole(job.title, job.location, job.description);
  if (!relevance.is_relevant) return "skipped";

  if (dryRun) return "dry_run";

  const now = new Date().toISOString();
  const source = `${job.source}_careers`;
  const { data: existing } = await supabaseAdmin
    .from("job_listings")
    .select("id, times_seen, first_seen_at")
    .eq("source", source)
    .eq("external_job_key", job.external_job_key)
    .maybeSingle();

  if (existing) {
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
      .eq("id", existing.id);
    return "updated";
  }

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
  });
  return "inserted";
}

async function runCareersIngest(options: { dryRun: boolean; limit: number; companyname?: string }) {
  let query = supabaseAdmin
    .from("companies")
    .select("id, companyname, city, niche, careers_url")
    .not("careers_url", "is", null)
    .order("tier", { ascending: true })
    .limit(options.limit);
  if (options.companyname) query = query.eq("companyname", options.companyname);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const companies = (data || []).filter((company) => {
    const niche = normalizeNiche(company.niche, company.companyname);
    return !isTodayExcludedNiche(niche) && !isExcludedStaffingCompany(company.companyname);
  }) as CompanyRow[];

  const summary = {
    dryRun: options.dryRun,
    companies_checked: 0,
    companies_with_jobs: 0,
    jobs_found: 0,
    jobs_relevant: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    source_counts: {} as Record<string, number>,
  };
  const results: Array<{ company: string; careers_url: string | null; found: number; relevant: number; actions: Record<string, number>; sources: AtsSource[]; warnings: string[]; sample: Array<{ title: string; location: string; url: string; source: string }> }> = [];

  for (const company of companies) {
    summary.companies_checked++;
    const fetched = await fetchCareerJobs(company);
    const actions: Record<string, number> = {};
    let relevant = 0;

    for (const job of fetched.jobs) {
      summary.jobs_found++;
      const relevance = scoreTargetRole(job.title, job.location, job.description);
      if (relevance.is_relevant) relevant++;
      const action = await upsertJob(job, company, options.dryRun);
      actions[action] = (actions[action] || 0) + 1;
      if (action === "inserted") summary.inserted++;
      if (action === "updated") summary.updated++;
      if (action === "skipped") summary.skipped++;
      if (action === "dry_run") summary.skipped++;
      summary.source_counts[job.source] = (summary.source_counts[job.source] || 0) + 1;
    }

    if (fetched.jobs.length > 0) summary.companies_with_jobs++;
    summary.jobs_relevant += relevant;
    results.push({
      company: company.companyname,
      careers_url: company.careers_url,
      found: fetched.jobs.length,
      relevant,
      actions,
      sources: fetched.sources,
      warnings: fetched.warnings,
      sample: fetched.jobs.slice(0, 5).map((job) => ({ title: job.title, location: job.location, url: job.job_url, source: job.source })),
    });
  }

  return { success: true, summary, results };
}

export async function GET(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 60), 150);
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
  const limit = Math.min(Number(body.limit || 60), 150);
  const companyname = typeof body.companyname === "string" ? body.companyname : undefined;

  try {
    const result = await runCareersIngest({ dryRun, limit, companyname });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
