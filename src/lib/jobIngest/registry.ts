// Registry that maps `source_type` strings to adapter implementations.

import { greenhouseAdapter } from "./adapters/greenhouse";
import { leverAdapter } from "./adapters/lever";
import { ashbyAdapter } from "./adapters/ashby";
import { manualSeedAdapter } from "./adapters/manualSeed";
import { mockAdapter } from "./adapters/mock";
import type { AdapterRegistry, JobSourceAdapter } from "./types";

const adapters: JobSourceAdapter[] = [
  greenhouseAdapter,
  leverAdapter,
  ashbyAdapter,
  manualSeedAdapter,
  mockAdapter,
];

const map = new Map<string, JobSourceAdapter>(
  adapters.map((adapter) => [adapter.sourceType, adapter])
);

export const adapterRegistry: AdapterRegistry = {
  list() {
    return [...adapters];
  },
  get(sourceType: string) {
    return map.get(sourceType);
  },
};

/**
 * Detects which ATS adapter (if any) handles a company's careers URL.
 * Used by the sync-company route when no explicit source_type is given.
 */
export function detectAdapterFromCareersUrl(
  careersUrl: string | null | undefined
): JobSourceAdapter | undefined {
  if (!careersUrl) return undefined;
  const lower = careersUrl.toLowerCase();
  if (lower.includes("greenhouse.io")) return adapterRegistry.get("greenhouse_careers");
  if (lower.includes("lever.co")) return adapterRegistry.get("lever_careers");
  if (lower.includes("ashbyhq.com")) return adapterRegistry.get("ashby_careers");
  return undefined;
}
