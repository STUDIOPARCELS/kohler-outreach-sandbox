// Phase 4 — generic adapter sync route.
//
// POST /api/jobs/sync-source
//   { source_type: string, company_id?: number, companyname?: string,
//     limit?: number, dryRun?: boolean }
//
// Body or query — both accepted. Auth is the same `requireApiSecret` used
// by other admin routes; cron secret also accepted for scheduled use.
//
// Behavior:
//   1. resolve adapter from source_type (or fail with 400)
//   2. resolve company by id or companyname (or fail with 400)
//   3. open a sync_runs row
//   4. fetch jobs via adapter
//   5. (unless dryRun) persist via persistNormalizedJobs
//   6. close the sync_runs row with counts/result
//   7. return JSON summary

import { NextRequest, NextResponse } from "next/server";
import { requireApiSecret, requireCronSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adapterRegistry } from "@/lib/jobIngest/registry";
import { persistNormalizedJobs } from "@/lib/jobIngest/persist";
import { errorSyncRun, finishSyncRun, startSyncRun } from "@/lib/syncRuns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RequestBody {
  source_type?: string;
  company_id?: number | null;
  companyname?: string | null;
  limit?: number;
  dryRun?: boolean;
}

async function readBody(req: NextRequest): Promise<RequestBody> {
  try {
    const json = (await req.json()) as RequestBody;
    return json ?? {};
  } catch {
    const url = new URL(req.url);
    return {
      source_type: url.searchParams.get("source_type") ?? undefined,
      company_id: url.searchParams.get("company_id")
        ? Number(url.searchParams.get("company_id"))
        : null,
      companyname: url.searchParams.get("companyname") ?? undefined,
      limit: url.searchParams.get("limit")
        ? Number(url.searchParams.get("limit"))
        : undefined,
      dryRun: url.searchParams.get("dryRun") === "true",
    };
  }
}

export async function POST(req: NextRequest) {
  // Accept either an api-secret call or a cron call.
  const apiAuth = requireApiSecret(req);
  if (apiAuth) {
    const cronAuth = requireCronSecret(req);
    if (cronAuth) return cronAuth;
  }

  const body = await readBody(req);
  if (!body.source_type) {
    return NextResponse.json({ error: "source_type required" }, { status: 400 });
  }
  const adapter = adapterRegistry.get(body.source_type);
  if (!adapter) {
    return NextResponse.json(
      { error: `unknown source_type: ${body.source_type}` },
      { status: 400 }
    );
  }
  if (!adapter.isConfigured()) {
    return NextResponse.json(
      { error: `adapter ${adapter.sourceType} is not configured` },
      { status: 400 }
    );
  }

  type CompanyRow = {
    id?: number | null;
    companyname: string;
    careers_url?: string | null;
    ats_slug?: string | null;
    niche?: string | null;
  };
  let companyRow: CompanyRow | null = null;

  if (body.company_id) {
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select("id, companyname, careers_url, niche")
      .eq("id", body.company_id)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json(
        { error: `company_id ${body.company_id} not found` },
        { status: 404 }
      );
    }
    companyRow = data as CompanyRow;
  } else if (body.companyname) {
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select("id, companyname, careers_url, niche")
      .ilike("companyname", body.companyname)
      .limit(1);
    if (error || !data || data.length === 0) {
      return NextResponse.json(
        { error: `companyname "${body.companyname}" not found` },
        { status: 404 }
      );
    }
    companyRow = data[0] as CompanyRow;
  } else {
    return NextResponse.json(
      { error: "company_id or companyname required" },
      { status: 400 }
    );
  }

  const handle = await startSyncRun({
    sourceType: adapter.sourceType,
    triggeredBy: body.dryRun ? "manual" : "adapter",
    params: { company_id: companyRow!.id, companyname: companyRow!.companyname, limit: body.limit ?? null },
  });

  try {
    const fetchResult = await adapter.fetchJobs({
      company: {
        id: companyRow!.id ?? null,
        companyname: companyRow!.companyname,
        careers_url: companyRow!.careers_url ?? null,
        niche: companyRow!.niche ?? null,
      },
      limit: body.limit,
    });

    if (body.dryRun) {
      await finishSyncRun(
        handle,
        fetchResult.errors.length > 0 ? "partial" : "completed",
        { inserted: 0, updated: 0, skipped: fetchResult.jobs.length, errors: fetchResult.errors.length },
        { warnings: fetchResult.warnings, result: { dryRun: true, fetched: fetchResult.jobs.length } }
      );
      return NextResponse.json({
        ok: true,
        dryRun: true,
        adapter: adapter.sourceType,
        company: companyRow!.companyname,
        fetched: fetchResult.jobs.length,
        errors: fetchResult.errors,
        warnings: fetchResult.warnings,
        sample: fetchResult.jobs.slice(0, 3),
      });
    }

    const { counts, errors: persistErrors } = await persistNormalizedJobs(
      fetchResult.jobs
    );

    const status =
      fetchResult.errors.length > 0 || persistErrors.length > 0
        ? counts.inserted + counts.updated > 0
          ? "partial"
          : "error"
        : "completed";

    await finishSyncRun(
      handle,
      status,
      {
        inserted: counts.inserted,
        updated: counts.updated,
        skipped: counts.skipped,
        errors: counts.errors + fetchResult.errors.length,
      },
      {
        warnings: [...fetchResult.warnings, ...persistErrors],
        result: { fetched: fetchResult.jobs.length, ...counts },
      }
    );

    return NextResponse.json({
      ok: status !== "error",
      adapter: adapter.sourceType,
      company: companyRow!.companyname,
      fetched: fetchResult.jobs.length,
      counts,
      adapterErrors: fetchResult.errors,
      persistErrors,
      warnings: fetchResult.warnings,
    });
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    await errorSyncRun(handle, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
