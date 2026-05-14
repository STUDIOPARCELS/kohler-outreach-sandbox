// Manual-seed adapter — used for hand-entered seed jobs that already live
// in `job_listings`. It does not fetch anything; it returns the rows so the
// generic sync route can re-emit them with provenance for parity with
// real adapters. Useful in tests and as a placeholder when other adapters
// have no slug.

import type { AdapterCompany, JobSourceAdapter } from "../types";

const SOURCE_TYPE = "manual_seed";

export const manualSeedAdapter: JobSourceAdapter = {
  sourceType: SOURCE_TYPE,
  displayName: "Manual seed",
  category: "manual",
  isConfigured() {
    return true;
  },
  async fetchJobs(_input: { company: AdapterCompany; limit?: number }) {
    return { jobs: [], errors: [], warnings: ["manual_seed adapter is read-only"] };
  },
};
