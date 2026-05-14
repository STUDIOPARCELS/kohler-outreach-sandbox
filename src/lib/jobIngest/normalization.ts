// Pure helpers extracted from the ingest routes so they can be unit-tested
// without running the full Next.js handler. Used by Phase 3 provenance and
// Phase 4 adapters.

import { createHash } from "crypto";

/**
 * Strip common corporate suffixes from a company name and trim whitespace.
 * Used for dedupe keys and company matching.
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return "";
  return name
    .replace(
      /[,\s]+(Corp\.?|Corporation|Inc\.?|LLC|Ltd\.?|Co\.?|Manufacturing|Services|Industries|Group)\.?\s*$/i,
      ""
    )
    .trim();
}

/**
 * Slug a string for use as a `company_key`.
 */
export function slugify(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Build the ZipRecruiter content-fingerprint key. Mirrors the
 * `buildContentKey` already used in the ZipRecruiter ingest route so that
 * external_job_key stays stable across refactors.
 */
export function buildZipRecruiterContentKey(
  company: string,
  title: string,
  location: string
): string {
  const input = [
    normalizeCompanyName(company).toLowerCase().trim(),
    (title || "").toLowerCase().trim(),
    (location || "").toLowerCase().trim(),
  ].join("|");
  return "zrc_" + createHash("sha256").update(input).digest("hex").slice(0, 20);
}

/**
 * Build the GovernmentJobs key from the upstream id.
 */
export function buildGovJobKey(jobId: string): string {
  return `gov_${jobId}`;
}

/**
 * Stable normalized hash for dedupe across sources. Used to populate the
 * Phase 3 `normalized_hash` column on job_listings. Differs from
 * `external_job_key` because it doesn't depend on the source's id scheme —
 * two adapters can publish the same role and get the same hash.
 */
export function normalizedHash(input: {
  company: string;
  title: string;
  location?: string | null;
  apply_url?: string | null;
}): string {
  const composite = [
    normalizeCompanyName(input.company).toLowerCase().trim(),
    (input.title || "").toLowerCase().replace(/\s+/g, " ").trim(),
    (input.location || "").toLowerCase().replace(/\s+/g, " ").trim(),
    canonicalizeUrl(input.apply_url || ""),
  ].join("|");
  return createHash("sha256").update(composite).digest("hex").slice(0, 32);
}

/**
 * Strip query parameters and tracking fragments so the URL piece of the
 * normalized hash is stable across UTM-tagged variants.
 */
export function canonicalizeUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    u.hash = "";
    // Drop common tracking params; keep functional params (job ids etc.).
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gh_src",
      "gh_jid",
      "src",
      "source",
      "ref",
      "trk",
    ];
    for (const param of trackingParams) {
      u.searchParams.delete(param);
    }
    // Sort remaining params for deterministic output.
    const entries = Array.from(u.searchParams.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    u.search = "";
    for (const [k, v] of entries) u.searchParams.append(k, v);
    return `${u.protocol}//${u.host}${u.pathname}${u.search ? `?${u.searchParams.toString()}` : ""}`;
  } catch {
    return rawUrl.toLowerCase().trim();
  }
}

/**
 * `external_job_key` builder for sources that have a stable upstream id.
 * Falls back to a content fingerprint for sources without one.
 */
export function buildExternalJobKey(input: {
  source_type: string;
  upstream_id?: string | null;
  company: string;
  title: string;
  location?: string | null;
}): string {
  if (input.upstream_id) {
    return `${input.source_type}_${input.upstream_id}`;
  }
  return buildZipRecruiterContentKey(
    input.company,
    input.title,
    input.location || ""
  );
}
