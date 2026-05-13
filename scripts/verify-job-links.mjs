const BASE_URL = process.env.KOHLER_SANDBOX_URL || "https://kohler-outreach-sandbox.vercel.app";
const ORIGIN = new URL(BASE_URL).origin;
const MIN_COMPANIES = Number(process.env.MIN_COMPANIES || 25);
const ENABLE_LIVE_FALLBACK = process.env.ENABLE_LIVE_FALLBACK !== "0";

const TARGET_NICHES = [
  "MEP / HVAC / Building Systems",
  "Government / Public Works / Infrastructure",
  "Water / Environmental / Geotech",
  "Aerospace / Space",
  "Quantum / Deep Tech / Electronics / Robotics",
  "Energy / Renewables / Power",
  "Manufacturing / Automation / Product Design",
];

const SENIORITY_BLOCK = /\b(?:senior|sr\.?|lead|principal|staff|manager|director|vp|vice president|chief|head|engineer\s*(?:iii|iv|v|3|4|5)|(?:iii|iv|v|3|4|5)\s*engineer)\b/i;
const NON_ENGINEERING_BLOCK = /\b(?:technician|operator|assembler|machinist|mechanic|warehouse|forklift|picker|clerk|customer service|administrative|recruiter|sales|business development|coordinator|scheduler|estimator|drafter)\b/i;
const TARGET_TITLE = /\b(?:mechanical|eit|engineer[-\s]?in[-\s]?training|hvac|mep|building systems|project engineer|manufacturing engineer|process engineer|quality engineer|test engineer|validation engineer|aerospace|space|robotics|mechatronics|electromechanical|thermal|systems engineer|environmental|water|civil)\b/i;
const GENERIC_URL = [
  /indeed\.com\/jobs\?/i,
  /linkedin\.com\/jobs\/search/i,
  /\/careers\/?($|[?#])/i,
  /\/jobs\/?($|[?#])/i,
  /\/job-search\/?($|[?#])/i,
];
const EXPIRED_TEXT = /\b(?:job is no longer available|position has been filled|posting has expired|job has expired|no longer accepting applications|this job is closed|page not found|404)\b/i;

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Origin: ORIGIN } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

function selectCompanies(openRoleCompanies, outreachCompanies = []) {
  const selected = [];
  const seen = new Set();

  for (const niche of TARGET_NICHES) {
    const ranked = openRoleCompanies
      .filter((row) => row.niche === niche && row.roles > 0)
      .sort((a, b) => (b.outreach_score || 0) - (a.outreach_score || 0) || b.roles - a.roles);
    for (const row of ranked.slice(0, 3)) {
      if (!seen.has(row.companyname)) {
        seen.add(row.companyname);
        selected.push(row);
      }
    }
  }

  for (const row of [...openRoleCompanies].sort((a, b) => b.roles - a.roles)) {
    if (selected.length >= MIN_COMPANIES) break;
    if (row.roles > 0 && TARGET_NICHES.includes(row.niche) && !seen.has(row.companyname)) {
      seen.add(row.companyname);
      selected.push(row);
    }
  }

  if (ENABLE_LIVE_FALLBACK && selected.length < MIN_COMPANIES) {
    for (const row of [...outreachCompanies].sort((a, b) => (b.outreach_score || 0) - (a.outreach_score || 0))) {
      if (selected.length >= MIN_COMPANIES) break;
      if (!TARGET_NICHES.includes(row.niche) || seen.has(row.companyname)) continue;
      seen.add(row.companyname);
      selected.push(row);
    }
  }

  return selected.slice(0, MIN_COMPANIES);
}

async function getCompanyJobs(companyname) {
  const trackedJobs = await getJson(`/api/relevant-roles?companyname=${encodeURIComponent(companyname)}`);
  if (trackedJobs.length > 0 || !ENABLE_LIVE_FALLBACK) {
    return { jobs: trackedJobs, responseSource: "tracked" };
  }
  const live = await postJson("/api/search-jobs", { companyname });
  return { jobs: Array.isArray(live.jobs) ? live.jobs : [], responseSource: live.source || "live" };
}

async function resolveUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 Kohler Outreach QA",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const contentType = res.headers.get("content-type") || "";
    const text = contentType.includes("text/html") ? await res.text() : "";
    return {
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      finalUrl: res.url,
      expired: EXPIRED_TEXT.test(text),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      expired: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function evaluateJob(job, resolved) {
  const reasons = [];
  const url = job.url || job.apply_url || "";
  if (!url || !url.startsWith("http")) reasons.push("missing direct URL");
  if (GENERIC_URL.some((pattern) => pattern.test(url))) reasons.push("generic search/careers URL");
  if (SENIORITY_BLOCK.test(job.title || "")) reasons.push("excluded senior/lead title");
  if (NON_ENGINEERING_BLOCK.test(job.title || "")) reasons.push("excluded non-engineering title");
  if (!TARGET_TITLE.test(`${job.title || ""} ${job.location || ""}`)) reasons.push("weak target-title match");
  if (!resolved.ok) reasons.push(`link HTTP ${resolved.status || resolved.error || "failed"}`);
  if (resolved.expired) reasons.push("page appears expired/closed");
  return reasons;
}

async function main() {
  const data = await getJson("/api/open-roles-list");
  const outreach = ENABLE_LIVE_FALLBACK ? await getJson("/api/outreach-list") : [];
  const selected = selectCompanies(data.companies || [], outreach);
  const results = [];

  for (const company of selected) {
    const { jobs, responseSource } = await getCompanyJobs(company.companyname);
    const checks = [];
    for (const job of jobs.slice(0, 3)) {
      const url = job.url || job.apply_url || "";
      const resolved = url ? await resolveUrl(url) : { ok: false, status: 0, finalUrl: "", expired: false };
      const failures = evaluateJob(job, resolved);
      checks.push({
        title: job.title,
        source: job.source,
        url,
        finalUrl: resolved.finalUrl,
        status: resolved.status,
        failures,
      });
    }
    results.push({
      company: company.companyname,
      niche: company.niche,
      listedRoles: company.roles,
      responseSource,
      tested: checks.length,
      passed: checks.filter((check) => check.failures.length === 0).length,
      checks,
    });
  }

  const failedCompanies = results.filter((row) => row.tested === 0 || row.passed === 0 || row.checks.some((check) => check.failures.length > 0));
  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    liveFallback: ENABLE_LIVE_FALLBACK,
    testedCompanies: results.length,
    failedCompanies: failedCompanies.length,
    results,
  }, null, 2));

  if (results.length < MIN_COMPANIES || failedCompanies.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
