// Deterministic mock adapter used by tests and local dev when real ATS
// endpoints are unreachable.

import { buildExternalJobKey } from "../normalization";
import type { JobSourceAdapter, NormalizedJob } from "../types";

const SOURCE_TYPE = "mock_ats";

const MOCK_JOBS: Omit<NormalizedJob, "company_name" | "company_id">[] = [
  {
    source_type: SOURCE_TYPE,
    source_url: "https://example.com/jobs/mock-1",
    external_job_id: "mock-1",
    title: "Mechanical Engineer",
    location: "Denver, CO",
    apply_url: "https://example.com/apply/mock-1",
    salary: "$75,000–$95,000",
    body_text: "Entry-level mechanical engineer. EIT preferred. SolidWorks, FEA, GD&T.",
    posted_at: "2026-05-01T00:00:00Z",
    parser_version: "mock-v1",
    raw_payload: { mock: true },
  },
  {
    source_type: SOURCE_TYPE,
    source_url: "https://example.com/jobs/mock-2",
    external_job_id: "mock-2",
    title: "Manufacturing Engineer",
    location: "Boulder, CO",
    apply_url: "https://example.com/apply/mock-2",
    salary: null,
    body_text: "Process engineer for advanced manufacturing line. CNC, DFM, FMEA.",
    posted_at: "2026-05-02T00:00:00Z",
    parser_version: "mock-v1",
    raw_payload: { mock: true },
  },
];

export const mockAdapter: JobSourceAdapter = {
  sourceType: SOURCE_TYPE,
  displayName: "Mock ATS",
  category: "ats",
  isConfigured() {
    return true;
  },
  async fetchJobs({ company, limit }) {
    const limited = typeof limit === "number" ? MOCK_JOBS.slice(0, limit) : MOCK_JOBS;
    const jobs = limited.map((job) => ({
      ...job,
      company_name: company.companyname,
      company_id: company.id ?? null,
      raw_payload: {
        ...(job.raw_payload as Record<string, unknown>),
        external_job_key: buildExternalJobKey({
          source_type: SOURCE_TYPE,
          upstream_id: job.external_job_id ?? undefined,
          company: company.companyname,
          title: job.title,
          location: job.location,
        }),
      },
    }));
    return { jobs, errors: [], warnings: [] };
  },
};
