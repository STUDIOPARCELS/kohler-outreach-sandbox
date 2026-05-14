// Phase 4 — sync-all route.
//
// POST /api/jobs/sync-all
//   { source_types?: string[], limit?: number, max_companies?: number,
//     dryRun?: boolean }
//
// Iterates over enabled adapters and the matching companies, calling
// `fetchJobs` and persisting results. Designed for scheduled use; safe to
// invoke on demand because every step is idempotent.
//
// Companies are matched to adapters by:
//   - explicit `ats_slug` column (preferred, set manually); else
//   - careers_url containing greenhouse.io / lever.co / ashbyhq.com.
//
// Email/aggregator/manual adapters (ziprecruiter_email, builtin_colorado,
// usajobs, manual_seed) are intentionally NOT iterated here — those have
// their own dedicated routes (`/api/ingest/ziprecruiter`, etc.).

import { NextRequest, NextResponse } from "next/server";
import { requireApiSecret, requireCronSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adapterRegistry, detectAdapterFromCareersUrl } from "@/lib/jobIngest/registry";
import { persistNormalizedJobs } from "@/lib/jobIngest/persist";
import { errorSyncRun, finishSyncRun, startSyncRun } from "@/lib/syncRuns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RequestBody {
  source_types?: string[];
  limit?: number;
  max_companies?: number;
  dryRun?: boolean;
}

const ITERABLE_CATEGORIES = new Set(["ats", "careers"]);

export async function POST(req: NextRequest) {
  const apiAuth = requireApiSecret(req);
  if (apiAuth) {
    const cronAuth = requireCronSecret(req);
    if (cronAuth) return cronAuth;
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    /* allow empty */
  }

  const sourceTypeFilter = body.source_types && body.source_types.length > 0
    ? new Set(body.source_types)
    : null;

  const eligibleAdapters = adapterRegistry
    .list()
    .filter((adapter) =>
      ITERABLE_CATEGORIES.has(adapter.category) &&
      (!sourceTypeFilter || sourceTypeFilter.has(adapter.sourceType)) &&
      adapter.isConfigured()
    );

  if (eligibleAdapters.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "no eligible adapters",
      hint: "pass source_types or enable an adapter",
    }, { status: 400 });
  }

  const maxCompanies = body.max_companies ?? 200;
  const { data: companies, error } = await supabaseAdmin
    .from("companies")
    .select("id, companyname, careers_url, niche")
    .not("careers_url", "is", null)
    .limit(maxCompanies);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `companies query failed: ${error.message}` },
      { status: 500 }
    );
  }

  const handle = await startSyncRun({
    sourceType: null,
    triggeredBy: "cron",
    params: {
      source_types: Array.from(sourceTypeFilter ?? []),
      max_companies: maxCompanies,
      dryRun: !!body.dryRun,
    },
  });

  const totals = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  const perSource: Record<string, { fetched: number; inserted: number; updated: number; skipped: number; errors: number }> = {};
  const warnings: string[] = [];

  try {
    for (const company of companies ?? []) {
      const careersUrl = (company as { careers_url?: string | null }).careers_url ?? null;
      const detected = detectAdapterFromCareersUrl(careersUrl);
      if (!detected) continue;
      if (sourceTypeFilter && !sourceTypeFilter.has(detected.sourceType)) continue;

      const stats = (perSource[detected.sourceType] ??= {
        fetched: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
      });

      try {
        const result = await detected.fetchJobs({
          company: {
            id: (company as { id?: number | null }).id ?? null,
            companyname: (company as { companyname: string }).companyname,
            careers_url: careersUrl,
            niche: (company as { niche?: string | null }).niche ?? null,
          },
          limit: body.limit,
        });
        stats.fetched += result.jobs.length;
        warnings.push(...result.warnings);

        if (body.dryRun) {
          stats.skipped += result.jobs.length;
          totals.skipped += result.jobs.length;
          continue;
        }

        const { counts, errors: persistErrors } = await persistNormalizedJobs(
          result.jobs
        );
        stats.inserted += counts.inserted;
        stats.updated += counts.updated;
        stats.skipped += counts.skipped;
        stats.errors += counts.errors + result.errors.length;
        totals.inserted += counts.inserted;
        totals.updated += counts.updated;
        totals.skipped += counts.skipped;
        totals.errors += counts.errors + result.errors.length;
        warnings.push(...persistErrors);
      } catch (err) {
        const msg = `${detected.sourceType} for ${(company as { companyname: string }).companyname} threw: ${(err as Error).message}`;
        warnings.push(msg);
        stats.errors++;
        totals.errors++;
      }
    }

    await finishSyncRun(
      handle,
      totals.errors > 0
        ? totals.inserted + totals.updated > 0
          ? "partial"
          : "error"
        : "completed",
      totals,
      { warnings, result: { perSource } }
    );

    return NextResponse.json({
      ok: totals.errors === 0,
      totals,
      perSource,
      warningsCount: warnings.length,
      warnings: warnings.slice(0, 30),
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    await errorSyncRun(handle, msg, warnings);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
