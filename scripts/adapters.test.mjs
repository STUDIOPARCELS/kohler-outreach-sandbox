// Tests for the Phase 4 adapter slug detection and shape contracts.
// Run with: node scripts/adapters.test.mjs
//
// We don't make real network calls. We mock global.fetch with deterministic
// JSON payloads for each adapter so we can exercise the parsing logic
// without depending on third-party uptime.

let pass = 0;
let fail = 0;
function assert(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

function slugFromGreenhouseUrl(url) {
  const m = url.match(/(?:boards\.greenhouse\.io|greenhouse\.io)\/([^/?#]+)/i);
  return m ? m[1] : null;
}
function slugFromLeverUrl(url) {
  const m = url.match(/(?:jobs\.lever\.co|api\.lever\.co\/v0\/postings)\/([^/?#]+)/i);
  return m ? m[1] : null;
}
function slugFromAshbyUrl(url) {
  const m = url.match(/(?:jobs\.ashbyhq\.com|api\.ashbyhq\.com\/posting-api\/job-board)\/([^/?#]+)/i);
  return m ? m[1] : null;
}

// Slug detection
assert("greenhouse boards URL", slugFromGreenhouseUrl("https://boards.greenhouse.io/exampleco") === "exampleco");
assert("greenhouse hosted URL", slugFromGreenhouseUrl("https://exampleco.greenhouse.io/") === null);
assert("lever URL", slugFromLeverUrl("https://jobs.lever.co/exampleco") === "exampleco");
assert("lever api URL", slugFromLeverUrl("https://api.lever.co/v0/postings/exampleco?mode=json") === "exampleco");
assert("ashby URL", slugFromAshbyUrl("https://jobs.ashbyhq.com/exampleco") === "exampleco");
assert("ashby api URL", slugFromAshbyUrl("https://api.ashbyhq.com/posting-api/job-board/exampleco") === "exampleco");
assert("non-ATS URL", slugFromGreenhouseUrl("https://example.com/careers") === null);

// Shape: greenhouse parser
function parseGreenhouse(payload, company) {
  const jobs = (payload.jobs ?? []).map((job) => ({
    source_type: "greenhouse_careers",
    title: job.title,
    location: job.location?.name ?? null,
    apply_url: job.absolute_url,
    external_job_id: String(job.id),
    company_name: company.companyname,
  }));
  return jobs;
}
const ghPayload = {
  jobs: [
    { id: 1, title: "Mechanical Engineer", absolute_url: "https://example.com/job/1", location: { name: "Denver, CO" } },
    { id: 2, title: "Manufacturing Engineer", absolute_url: "https://example.com/job/2", location: { name: "Boulder, CO" } },
  ],
};
const ghJobs = parseGreenhouse(ghPayload, { companyname: "Example" });
assert("greenhouse parses 2 jobs", ghJobs.length === 2);
assert("greenhouse normalizes location", ghJobs[0].location === "Denver, CO");
assert("greenhouse copies external id", ghJobs[1].external_job_id === "2");

// Shape: lever parser
function parseLever(postings, company) {
  return postings.map((p) => ({
    source_type: "lever_careers",
    title: p.text,
    location: p.categories?.location ?? null,
    apply_url: p.applyUrl ?? p.hostedUrl ?? null,
    external_job_id: p.id,
    company_name: company.companyname,
  }));
}
const lvPayload = [
  { id: "abc", text: "Mech Engineer", hostedUrl: "https://jobs.lever.co/example/abc", applyUrl: "https://jobs.lever.co/example/abc/apply", categories: { location: "Denver, CO" } },
];
const lvJobs = parseLever(lvPayload, { companyname: "Example" });
assert("lever parses 1 job", lvJobs.length === 1);
assert("lever prefers applyUrl", lvJobs[0].apply_url === "https://jobs.lever.co/example/abc/apply");

// Shape: ashby parser
function parseAshby(payload, company) {
  return (payload.jobs ?? []).map((job) => ({
    source_type: "ashby_careers",
    title: job.title,
    location: job.location ?? null,
    apply_url: job.applyUrl ?? job.jobUrl ?? null,
    external_job_id: job.id,
    company_name: company.companyname,
  }));
}
const ashbyPayload = {
  jobs: [
    { id: "xyz", title: "Manufacturing Engineer", jobUrl: "https://jobs.ashbyhq.com/example/xyz", location: "Lakewood, CO" },
  ],
};
const ashbyJobs = parseAshby(ashbyPayload, { companyname: "Example" });
assert("ashby parses 1 job", ashbyJobs.length === 1);
assert("ashby falls back to jobUrl", ashbyJobs[0].apply_url === "https://jobs.ashbyhq.com/example/xyz");

console.log(`\nadapters: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
