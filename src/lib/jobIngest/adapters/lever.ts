// Lever public postings adapter.
// Endpoint: https://api.lever.co/v0/postings/{slug}?mode=json
// Public (no auth). Slug lives on the company as `ats_slug` or is derived
// from `careers_url` pointing at jobs.lever.co.

import { buildExternalJobKey } from "../normalization";
import type {
  AdapterCompany,
  JobSourceAdapter,
  NormalizedJob,
} from "../types";

const SOURCE_TYPE = "lever_careers";
const POSTINGS_API = "https://api.lever.co/v0/postings";

interface LeverCategory {
  team?: string | null;
  location?: string | null;
  commitment?: string | null;
}
interface LeverPosting {
  id: string;
  text: string;
  hostedUrl?: string | null;
  applyUrl?: string | null;
  categories?: LeverCategory | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  descriptionPlain?: string | null;
  description?: string | null;
}

function slugFromCompany(company: AdapterCompany): string | null {
  if (company.ats_slug) return company.ats_slug;
  const url = company.careers_url || "";
  const match = url.match(/(?:jobs\.lever\.co|api\.lever\.co\/v0\/postings)\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function toIso(ms?: number | null): string | null {
  if (!ms) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

export const leverAdapter: JobSourceAdapter = {
  sourceType: SOURCE_TYPE,
  displayName: "Lever",
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
        warnings: [`lever: no slug found for ${company.companyname}`],
      };
    }
    const url = `${POSTINGS_API}/${encodeURIComponent(slug)}?mode=json`;
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "kohler-outreach/1.0" },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        jobs: [],
        errors: [`lever ${response.status} for ${slug}`],
        warnings: [],
      };
    }
    const postings = (await response.json()) as LeverPosting[] | null;
    if (!Array.isArray(postings)) {
      return {
        jobs: [],
        errors: [`lever returned non-array for ${slug}`],
        warnings: [],
      };
    }
    const limited = typeof limit === "number" ? postings.slice(0, limit) : postings;
    const jobs: NormalizedJob[] = limited.map((post) => {
      const location = post.categories?.location ?? null;
      const upstreamId = post.id;
      const body =
        post.descriptionPlain ??
        (post.description ? stripHtml(post.description) : null);
      return {
        source_type: SOURCE_TYPE,
        source_url: post.hostedUrl ?? null,
        external_job_id: upstreamId,
        title: post.text,
        company_name: company.companyname,
        company_id: company.id ?? null,
        location,
        apply_url: post.applyUrl ?? post.hostedUrl ?? null,
        salary: null,
        body_text: body,
        posted_at: toIso(post.updatedAt) ?? toIso(post.createdAt),
        parser_version: "lever-v1",
        raw_payload: {
          slug,
          team: post.categories?.team ?? null,
          commitment: post.categories?.commitment ?? null,
          external_job_key: buildExternalJobKey({
            source_type: SOURCE_TYPE,
            upstream_id: upstreamId,
            company: company.companyname,
            title: post.text,
            location,
          }),
        },
      };
    });
    return { jobs, errors: [], warnings: [] };
  },
};
