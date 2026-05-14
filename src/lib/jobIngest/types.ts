// Shared types for the Phase 4 adapter architecture.

export type JobSourceCategory =
  | "email"
  | "ats"
  | "careers"
  | "aggregator"
  | "gov_api"
  | "manual"
  | "other";

export interface NormalizedJob {
  source_type: string;
  source_url: string | null;
  external_job_id: string | null;
  title: string;
  company_name: string;
  company_id?: string | number | null;
  location: string | null;
  apply_url: string | null;
  salary: string | null;
  body_text: string | null;
  posted_at: string | null;
  parser_version: string;
  raw_payload: unknown;
}

export interface AdapterCompany {
  id?: string | number | null;
  companyname: string;
  careers_url?: string | null;
  ats_slug?: string | null;
  niche?: string | null;
}

export interface JobSourceAdapter {
  /**
   * Identifier matching `job_sources.source_type`.
   */
  readonly sourceType: string;
  /**
   * Friendly display name for logs and UI.
   */
  readonly displayName: string;
  /**
   * Category drives which sync route handles it (cron vs. on-demand).
   */
  readonly category: JobSourceCategory;
  /**
   * Returns `true` when the adapter has the credentials/config it needs.
   * Adapters with no creds return `true` so they can run anywhere.
   */
  isConfigured(): boolean;
  /**
   * Returns normalized job rows for one company. Implementations should
   * never throw — wrap unexpected errors and return them in `errors`.
   */
  fetchJobs(input: {
    company: AdapterCompany;
    limit?: number;
  }): Promise<{
    jobs: NormalizedJob[];
    errors: string[];
    warnings: string[];
  }>;
}

export interface AdapterRegistry {
  list(): JobSourceAdapter[];
  get(sourceType: string): JobSourceAdapter | undefined;
}
