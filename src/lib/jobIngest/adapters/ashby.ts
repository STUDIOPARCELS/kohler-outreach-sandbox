// Ashby public job-board adapter.
// Endpoint: https://api.ashbyhq.com/posting-api/job-board/{slug}
// Optional ?includeCompensation=true (we omit by default).
// Public (no auth). Slug lives on the company as `ats_slug` or is derived
// from `careers_url` pointing at jobs.ashbyhq.com.

import { buildExternalJobKey } from "../normalization";
import type {
  AdapterCompany,
  JobSourceAdapter,
  NormalizedJob,
} from "../types";

const SOURCE_TYPE = "ashby_careers";
const POSTING_API = "https://api.ashbyhq.com/posting-api/job-board";

interface AshbyAddress {
  postalAddress?: {
    addressRegion?: string | null;
    addressLocality?: string | null;
    addressCountry?: string | null;
  } | null;
}
interface AshbyJob {
  id: string;
  title: string;
  jobUrl?: string | null;
  applyUrl?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  location?: string | null;
  address?: AshbyAddress | null;
  descriptionPlain?: string | null;
  descriptionHtml?: string | null;
  isRemote?: boolean | null;
  employmentType?: string | null;
  team?: string | null;
}

function slugFromCompany(company: AdapterCompany): string | null {
  if (company.ats_slug) return company.ats_slug;
  const url = company.careers_url || "";
  const match = url.match(/(?:jobs\.ashbyhq\.com|api\.ashbyhq\.com\/posting-api\/job-board)\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function locationOf(job: AshbyJob): string | null {
  if (job.location) return job.location;
  const addr = job.address?.postalAddress;
  if (!addr) return job.isRemote ? "Remote" : null;
  const parts = [addr.addressLocality, addr.addressRegion].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export const ashbyAdapter: JobSourceAdapter = {
  sourceType: SOURCE_TYPE,
  displayName: "Ashby",
  category: "ats",
  isConfigured() {
    return true;
  },
  async fetchJobs({ company, limit }) {
    const slug = slugFromCompany(company);
    if (!slug) {
      return {
        jobs: [],
        errors: [],
        warnings: [`ashby: no slug found for ${company.companyname}`],
      };
    }
    const url = `${POSTING_API}/${encodeURIComponent(slug)}`;
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "kohler-outreach/1.0" },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        jobs: [],
        errors: [`ashby ${response.status} for ${slug}`],
        warnings: [],
      };
    }
    const payload = (await response.json()) as { jobs?: AshbyJob[] };
    const rawJobs = payload.jobs ?? [];
    const limited = typeof limit === "number" ? rawJobs.slice(0, limit) : rawJobs;
    const jobs: NormalizedJob[] = limited.map((job) => {
      const upstreamId = job.id;
      const location = locationOf(job);
      return {
        source_type: SOURCE_TYPE,
        source_url: job.jobUrl ?? null,
        external_job_id: upstreamId,
        title: job.title,
        company_name: company.companyname,
        company_id: company.id ?? null,
        location,
        apply_url: job.applyUrl ?? job.jobUrl ?? null,
        salary: null,
        body_text: job.descriptionPlain ?? null,
        posted_at: job.publishedAt ?? job.updatedAt ?? null,
        parser_version: "ashby-v1",
        raw_payload: {
          slug,
          team: job.team ?? null,
          employmentType: job.employmentType ?? null,
          isRemote: job.isRemote ?? null,
          external_job_key: buildExternalJobKey({
            source_type: SOURCE_TYPE,
            upstream_id: upstreamId,
            company: company.companyname,
            title: job.title,
            location,
          }),
        },
      };
    });
    return { jobs, errors: [], warnings: [] };
  },
};
