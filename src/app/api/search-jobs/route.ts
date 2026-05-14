import { requireAppOrigin } from "@/lib/auth";
import { getReliableJobUrl, isDirectJobUrl } from "@/lib/jobLinks";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isTodayTargetJob } from "@/lib/targeting";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LIVE_JOB_FETCH_TIMEOUT_MS = 8000;
const CLOSED_POSTING_TEXT = /\b(?:job is no longer available|position has been filled|posting has expired|job has expired|no longer accepting applications|this job is closed|page not found|404)\b/i;

interface CareerCompanyRow {
  companyname: string;
  city: string | null;
  careers_url: string | null;
}

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

interface DirectCareerJob {
  title: string;
  location: string;
  apply_url: string;
  source: "workday_careers" | "oracle_careers";
  summary: string;
  work_type?: string;
}

async function isLiveJobUrlActive(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_JOB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 Kohler Outreach job verifier",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });
    if (res.status < 200 || res.status >= 400) return false;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return true;
    const html = await res.text();
    return !CLOSED_POSTING_TEXT.test(html);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDirectText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_JOB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
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

async function fetchDirectJson<T>(url: string): Promise<T> {
  const text = await fetchDirectText(url);
  return JSON.parse(text) as T;
}

async function fetchDirectJsonPost<T>(url: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_JOB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
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

function detectWorkdayToken(url: string, html: string): WorkdayToken | undefined {
  const combined = `${url}\n${html}`;
  const workdaySite = combined.match(/https?:\/\/([^"'\s]+?\.myworkdaysite\.com)\/(?:[a-z]{2}-[A-Z]{2}\/)?recruiting\/([^\/"'\s]+)\/([^\/"'\s?#]+)/i);
  if (workdaySite) {
    return {
      host: workdaySite[1],
      tenant: workdaySite[2],
      site: workdaySite[3],
      publicBase: `https://${workdaySite[1]}/en-US/recruiting/${workdaySite[2]}/${workdaySite[3]}`,
    };
  }

  const workdayJobs = combined.match(/https?:\/\/([^"'\s]+?\.myworkdayjobs\.com)\/(?:[a-z]{2}-[A-Z]{2}\/)?([^\/"'\s?#]+)/i);
  if (!workdayJobs) return undefined;
  return {
    host: workdayJobs[1],
    tenant: workdayJobs[1].split(".")[0],
    site: workdayJobs[2],
    publicBase: `https://${workdayJobs[1]}/en-US/${workdayJobs[2]}`,
  };
}

function detectOracleToken(url: string, html: string): OracleToken | undefined {
  const combined = `${url}\n${html}`;
  const oracleMatch = combined.match(/https?:\/\/([^"'\s]+?\.oraclecloud\.com)\/hcmUI\/CandidateExperience\/(?:[^"'\s]+?\/)?sites\/(CX_\d+)/i);
  if (!oracleMatch) return undefined;
  return {
    host: oracleMatch[1],
    siteNumber: oracleMatch[2],
    publicBase: `https://${oracleMatch[1]}/hcmUI/CandidateExperience/en/sites/${oracleMatch[2]}/requisitions/preview`,
  };
}

function knownOracleTokenFor(company: CareerCompanyRow): OracleToken | undefined {
  if (!(/\bwsp\b/i.test(company.companyname) || /wsp\.com/i.test(company.careers_url || ""))) return undefined;
  return {
    host: "emit.fa.ca3.oraclecloud.com",
    siteNumber: "CX_2001",
    publicBase: "https://emit.fa.ca3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2001/requisitions/preview",
  };
}

function knownWorkdayTokenFor(company: CareerCompanyRow): WorkdayToken | undefined {
  if (!(/\bcoorstek\b/i.test(company.companyname) || /coorstek\.com/i.test(company.careers_url || ""))) return undefined;
  return {
    host: "coorstek.wd1.myworkdayjobs.com",
    tenant: "coorstek",
    site: "CoorsTekCareers",
    publicBase: "https://coorstek.wd1.myworkdayjobs.com/en-US/CoorsTekCareers",
  };
}

interface WorkdayJobPosting {
  title?: string;
  locationsText?: string;
  externalPath?: string;
  bulletFields?: string[];
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
    const data = await fetchDirectJsonPost<{ total?: number; jobPostings?: WorkdayJobPosting[] }>(
      endpoint,
      { appliedFacets: {}, limit: WORKDAY_LIMIT, offset: 0, searchText: "" }
    );
    total = Number(data.total || 0);
    addPostings(data.jobPostings || []);
  } catch { /* fall back to targeted searches */ }

  if (postings.length === 0 || total > postings.length) {
    for (const term of WORKDAY_SEARCH_TERMS) {
      try {
        const data = await fetchDirectJsonPost<{ jobPostings?: WorkdayJobPosting[] }>(
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

async function fromWorkday(token: WorkdayToken, company: CareerCompanyRow): Promise<DirectCareerJob[]> {
  const endpoint = `https://${token.host}/wday/cxs/${encodeURIComponent(token.tenant)}/${encodeURIComponent(token.site)}/jobs`;
  const postings = await fetchWorkdayPostings(endpoint);

  return postings.map((job) => {
    const url = job.externalPath
      ? `${token.publicBase}${job.externalPath.startsWith("/") ? job.externalPath : `/${job.externalPath}`}`
      : token.publicBase;
    return {
      title: job.title || "",
      location: job.locationsText || company.city || "",
      apply_url: url,
      work_type: Array.isArray(job.bulletFields) ? job.bulletFields.join(", ") : "",
      source: "workday_careers" as const,
      summary: "Direct company Workday posting.",
    };
  }).filter((job) => job.title && job.apply_url);
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

async function fromOracle(token: OracleToken): Promise<DirectCareerJob[]> {
  const jobs: DirectCareerJob[] = [];
  const seen = new Set<string>();

  for (const term of ORACLE_SEARCH_TERMS) {
    let data: OracleSearchResponse;
    try {
      data = await fetchDirectJson<OracleSearchResponse>(oracleSearchUrl(token, term));
    } catch {
      continue;
    }
    for (const item of data.items || []) {
      for (const job of item.requisitionList || []) {
        const id = String(job.Id || "");
        if (!id || !job.Title || seen.has(id)) continue;
        seen.add(id);
        const secondary = (job.secondaryLocations || []).map((loc) => loc.Name).filter(Boolean) as string[];
        const location = [job.PrimaryLocation, ...secondary].filter(Boolean).join(" | ");
        jobs.push({
          title: job.Title,
          location,
          apply_url: `${token.publicBase}/${encodeURIComponent(id)}`,
          source: "oracle_careers",
          summary: job.ShortDescriptionStr || "Direct Oracle Candidate Experience posting.",
        });
      }
    }
  }

  return jobs;
}

async function fetchDirectCareerJobs(company: CareerCompanyRow): Promise<DirectCareerJob[]> {
  const careersUrl = company.careers_url || "";
  if (!careersUrl) return [];

  const jobs: DirectCareerJob[] = [];
  const knownOracle = knownOracleTokenFor(company);
  if (knownOracle) jobs.push(...await fromOracle(knownOracle));
  const knownWorkday = knownWorkdayTokenFor(company);
  if (knownWorkday) jobs.push(...await fromWorkday(knownWorkday, company));

  let html = "";
  try {
    html = await fetchDirectText(careersUrl);
  } catch {
    return jobs;
  }

  const detectedOracle = detectOracleToken(careersUrl, html);
  if (detectedOracle && !knownOracle) jobs.push(...await fromOracle(detectedOracle));

  const workday = detectWorkdayToken(careersUrl, html);
  if (workday && !knownWorkday) jobs.push(...await fromWorkday(workday, company));

  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = `${job.source}:${job.apply_url}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const { companyname } = await req.json();
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  // FIRST: check job_listings for existing jobs linked to this company
  const { data: dbJobs } = await supabaseAdmin
    .from("job_listings")
    .select("title, companyname, location, salary, job_url, apply_url, employment_type, source, received_at, is_relevant")
    .eq("companyname", companyname)
    .eq("is_relevant", true)
    .in("ingest_status", ["new", "open"])
    .order("received_at", { ascending: false });

  const targetDbJobs = (dbJobs || [])
    .map((job) => ({ ...job, reliable_url: getReliableJobUrl(job) }))
    .filter((job) =>
      job.reliable_url && isTodayTargetJob({
      title: job.title,
      companyname: job.companyname,
      location: job.location,
      is_relevant: job.is_relevant,
      job_url: job.reliable_url,
    })
  );

  if (targetDbJobs.length > 0) {
    return NextResponse.json({
      jobs: targetDbJobs.map((j) => ({
        title: j.title,
        location: j.location || "Denver metro",
        salary: j.salary || null,
        url: j.reliable_url || "",
        work_type: j.employment_type || null,
        source: j.source || "database",
      })),
      source: "database",
    });
  }

  // SECOND: query deterministic ATS endpoints before falling back to generic web search.
  const { data: companyRow } = await supabaseAdmin
    .from("companies")
    .select("companyname, city, careers_url")
    .eq("companyname", companyname)
    .single();

  const careersUrl = companyRow?.careers_url || null;
  if (companyRow?.careers_url) {
    try {
      const directJobs = await fetchDirectCareerJobs(companyRow as CareerCompanyRow);
      let jobs = directJobs
        .filter((job) =>
          isDirectJobUrl(job.apply_url) &&
          isTodayTargetJob({
            title: job.title,
            companyname,
            location: job.location,
            is_relevant: true,
            apply_url: job.apply_url,
          })
        )
        .slice(0, 8);
      const checks = await Promise.all(jobs.map(async (job) => ({
        job,
        active: await isLiveJobUrlActive(job.apply_url),
      })));
      jobs = checks.filter((check) => check.active).map((check) => check.job);
      if (jobs.length > 0) {
        return NextResponse.json({ jobs, careers_url: careersUrl, source: "direct_careers" });
      }
    } catch (err) {
      console.warn("direct career search failed:", err);
    }
  }

  // FALLBACK: web search via OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ jobs: [], careers_url: careersUrl, source: "no_key" });

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        tools: [{ type: "web_search_preview" }],
        input: `Search for current engineering job openings at "${companyname}" in Colorado.

Search the company careers page and its applicant tracking system only${careersUrl ? `, starting here: ${careersUrl}` : ""}.

INCLUDE: Mechanical/EIT-track engineering roles first: mechanical, MEP/HVAC/building systems, aerospace/space hardware, robotics/mechatronics, manufacturing, design, test, project, systems, process, quality, structural, reliability, environmental, water, energy, civil, or related. Include Engineer I, entry-level, early career, new grad, associate, junior, or 0-3 years experience. Prefer roles with PE mentorship, licensed engineering leadership, or a path toward PE. Must require a Bachelor's degree in engineering or related field.
EXCLUDE: Engineer II, Engineer III, Senior, Lead, Principal, Staff, Manager, Director, VP, or 5+ years required. Also exclude any position that requires only a GED, high school diploma, or associate degree. Also exclude technician, operator, assembler, machinist, and warehouse roles.

CRITICAL: For apply_url, ONLY use URLs that appeared in your web search results and link to the SPECIFIC JOB POSTING page. Do not return Indeed search pages, LinkedIn search pages, generic careers pages, or generic job-list pages. If you cannot find a direct posting URL, leave apply_url as an empty string.

Return ONLY a JSON array (no markdown, no backticks):
[{"title":"exact title","salary":"range or empty string","location":"city, state","summary":"1 sentence; required skills: [skill1, skill2]","apply_url":"direct URL to this specific job posting or empty string","source":"company careers or ATS name"}]

If no engineering jobs found, return [].
ONLY the JSON array.`,
        text: { format: { type: "text" } },
      }),
    });

    if (!res.ok) return NextResponse.json({ jobs: [], source: "api_error" });

    const data = await res.json();

    let text = "";
    if (data.output) {
      for (const item of data.output) {
        if (item.type === "message" && item.content) {
          for (const c of item.content) {
            if (c.type === "output_text") text += c.text;
          }
        }
      }
    }

    let jobs: { title: string; salary: string; location: string; summary: string; apply_url: string; source: string }[] = [];
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        jobs = parsed
          .filter((j: Record<string, unknown>) =>
            j.title &&
            isDirectJobUrl(String(j.apply_url || "")) &&
            isTodayTargetJob({
              title: String(j.title),
              companyname,
              location: String(j.location || ""),
              is_relevant: true,
              apply_url: String(j.apply_url || ""),
            })
          )
          .slice(0, 8)
          .map((j: Record<string, unknown>) => {
            const url = String(j.apply_url || "");
            const source = String(j.source || "");

            return {
              title: String(j.title || ""),
              salary: String(j.salary || ""),
              location: String(j.location || ""),
              summary: String(j.summary || ""),
              apply_url: url,
              source,
            };
          });
        const checks = await Promise.all(jobs.map(async (job) => ({
          job,
          active: await isLiveJobUrlActive(job.apply_url),
        })));
        jobs = checks.filter((check) => check.active).map((check) => check.job);
      }
    } catch { /* parse failed */ }

    return NextResponse.json({ jobs, careers_url: careersUrl, source: "live" });
  } catch (e) {
    console.error("search-jobs error:", e);
    return NextResponse.json({ jobs: [], source: "error" });
  }
}
