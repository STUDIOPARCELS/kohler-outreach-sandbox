// Greenhouse public job-board adapter.
// Endpoint: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
// Public (no auth). Slug lives on each company as `ats_slug` or is derived
// from `careers_url` when it points at boards.greenhouse.io.

import { buildExternalJobKey } from "../normalization";
import type {
  AdapterCompany,
  JobSourceAdapter,
  NormalizedJob,
} from "../types";

const SOURCE_TYPE = "greenhouse_careers";
const BOARD_API = "https://boards-api.greenhouse.io/v1/boards";

interface GreenhouseLocation {
  name?: string | null;
}
interface GreenhouseOffice {
  name?: string | null;
}
interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  internal_job_id?: number | null;
  location?: GreenhouseLocation | null;
  offices?: GreenhouseOffice[] | null;
  updated_at?: string | null;
  content?: string | null;
}

function slugFromCompany(company: AdapterCompany): string | null {
  if (company.ats_slug) return company.ats_slug;
  const url = company.careers_url || "";
  const match = url.match(/boards\.greenhouse\.io\/([^/?#]+)/i);
  if (match) return match[1];
  const hosted = url.match(/greenhouse\.io\/([^/?#]+)/i);
  return hosted ? hosted[1] : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export const greenhouseAdapter: JobSourceAdapter = {
  sourceType: SOURCE_TYPE,
  displayName: "Greenhouse",
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
        warnings: [`greenhouse: no slug found for ${company.companyname}`],
      };
    }
    const url = `${BOARD_API}/${encodeURIComponent(slug)}/jobs?content=true`;
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "kohler-outreach/1.0" },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        jobs: [],
        errors: [`greenhouse ${response.status} for ${slug}`],
        warnings: [],
      };
    }
    const payload = (await response.json()) as { jobs?: GreenhouseJob[] };
    const rawJobs = payload.jobs ?? [];
    const limited = typeof limit === "number" ? rawJobs.slice(0, limit) : rawJobs;
    const jobs: NormalizedJob[] = limited.map((job) => {
      const location =
        job.location?.name ??
        job.offices?.map((o) => o.name).filter(Boolean).join(", ") ??
        null;
      const upstreamId = String(job.id);
      return {
        source_type: SOURCE_TYPE,
        source_url: job.absolute_url,
        external_job_id: upstreamId,
        title: job.title,
        company_name: company.companyname,
        company_id: company.id ?? null,
        location,
        apply_url: job.absolute_url,
        salary: null,
        body_text: job.content ? stripHtml(job.content) : null,
        posted_at: job.updated_at ?? null,
        parser_version: "greenhouse-v1",
        raw_payload: {
          slug,
          external_job_key: buildExternalJobKey({
            source_type: SOURCE_TYPE,
            upstream_id: upstreamId,
            company: company.companyname,
            title: job.title,
            location,
          }),
          internal_job_id: job.internal_job_id ?? null,
        },
      };
    });
    return { jobs, errors: [], warnings: [] };
  },
};
