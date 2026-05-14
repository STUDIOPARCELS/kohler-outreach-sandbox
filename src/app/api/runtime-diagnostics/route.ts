import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRuntimeEnvironment } from "@/lib/runtimeEnvironment";

export const dynamic = "force-dynamic";

interface SyncRunSummary {
  source_type: string | null;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  inserted: number | null;
  updated: number | null;
  errors: number | null;
}

interface DiagnosticsPayload {
  ok: boolean;
  environment: ReturnType<typeof getRuntimeEnvironment>;
  jobs: {
    total: number | null;
    relevant: number | null;
    distinctOpenRoleCompanies: number | null;
    latestPostedAt: string | null;
  };
  ingest: {
    latestRun: SyncRunSummary | null;
    lastSuccessfulIngestAt: string | null;
    runsTable: "job_ingest_runs" | "sync_runs" | null;
  };
  gmail: {
    accounts: number | null;
    cursors: Array<{ email: string | null; last_history_id: string | null; updated_at: string | null }>;
  };
  warnings: string[];
}

async function fetchSyncRunSummary(): Promise<{
  latest: SyncRunSummary | null;
  lastSuccessfulAt: string | null;
  table: "job_ingest_runs" | "sync_runs" | null;
}> {
  // Prefer sync_runs once Phase 3 ships. Fall back to job_ingest_runs.
  for (const table of ["sync_runs", "job_ingest_runs"] as const) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(20);

    if (error) continue;
    if (!data || data.length === 0) {
      return { latest: null, lastSuccessfulAt: null, table };
    }

    const latestRow = data[0] as Record<string, unknown>;
    // Map both shapes:
    //   sync_runs: jobs_inserted/jobs_updated (int), errors (jsonb array)
    //   job_ingest_runs: jobs_extracted (int), companies_created (int), error_text (string)
    const errorsField = latestRow.errors;
    const errorsCount = Array.isArray(errorsField)
      ? errorsField.length
      : typeof errorsField === "number"
        ? (errorsField as number)
        : (latestRow.error_count as number | null) ?? null;
    const latest: SyncRunSummary = {
      source_type:
        (latestRow.source_type as string | null) ??
        (latestRow.source as string | null) ??
        null,
      status: (latestRow.status as string | null) ?? null,
      started_at:
        (latestRow.started_at as string | null) ??
        (latestRow.created_at as string | null) ??
        null,
      finished_at: (latestRow.finished_at as string | null) ?? null,
      inserted:
        typeof latestRow.jobs_inserted === "number"
          ? (latestRow.jobs_inserted as number)
          : typeof latestRow.inserted === "number"
            ? (latestRow.inserted as number)
            : (latestRow.jobs_extracted as number | null) ?? null,
      updated:
        typeof latestRow.jobs_updated === "number"
          ? (latestRow.jobs_updated as number)
          : typeof latestRow.updated === "number"
            ? (latestRow.updated as number)
            : null,
      errors: errorsCount,
    };

    const lastOk = data.find((row) => {
      const status = (row as Record<string, unknown>).status;
      return (
        status === "completed" ||
        status === "completed_with_errors" ||
        status === "ok" ||
        status === "success"
      );
    }) as Record<string, unknown> | undefined;

    return {
      latest,
      lastSuccessfulAt:
        (lastOk?.finished_at as string | null) ??
        (lastOk?.started_at as string | null) ??
        null,
      table,
    };
  }

  return { latest: null, lastSuccessfulAt: null, table: null };
}

async function fetchJobsSnapshot() {
  const warnings: string[] = [];
  let total: number | null = null;
  let relevant: number | null = null;
  let distinctOpenRoleCompanies: number | null = null;
  let latestPostedAt: string | null = null;

  const { count: totalCount, error: totalErr } = await supabaseAdmin
    .from("job_listings")
    .select("*", { count: "exact", head: true });
  if (totalErr) warnings.push(`job_listings count: ${totalErr.message}`);
  else total = totalCount ?? null;

  const { count: relCount, error: relErr } = await supabaseAdmin
    .from("job_listings")
    .select("*", { count: "exact", head: true })
    .eq("is_relevant", true);
  if (relErr) warnings.push(`job_listings relevant count: ${relErr.message}`);
  else relevant = relCount ?? null;

  // Drive-by fix flagged by Session A: live column is posted_date (not
  // date_posted), and there is no created_at column on job_listings —
  // use received_at / fetched_at / last_seen_at instead.
  const { data: latestRows, error: latestErr } = await supabaseAdmin
    .from("job_listings")
    .select("posted_date, last_seen_at, received_at, fetched_at")
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (latestErr) warnings.push(`job_listings latest: ${latestErr.message}`);
  else if (latestRows && latestRows.length > 0) {
    const row = latestRows[0] as Record<string, unknown>;
    latestPostedAt =
      (row.posted_date as string | null) ??
      (row.last_seen_at as string | null) ??
      (row.received_at as string | null) ??
      (row.fetched_at as string | null) ??
      null;
  }

  const { data: distinctRows, error: distinctErr } = await supabaseAdmin
    .from("job_listings")
    .select("companyname")
    .eq("is_relevant", true);
  if (distinctErr) {
    warnings.push(`distinct companies: ${distinctErr.message}`);
  } else if (distinctRows) {
    const set = new Set<string>();
    for (const row of distinctRows) {
      const name = (row as { companyname?: string | null }).companyname;
      if (name) set.add(name);
    }
    distinctOpenRoleCompanies = set.size;
  }

  return { total, relevant, distinctOpenRoleCompanies, latestPostedAt, warnings };
}

async function fetchGmailSnapshot() {
  const { data, error } = await supabaseAdmin
    .from("gmail_accounts")
    .select("email, last_history_id, updated_at");
  if (error) {
    return { accounts: 0, cursors: [], warning: `gmail_accounts: ${error.message}` };
  }
  const cursors = (data ?? []).map((row) => ({
    email: (row as { email?: string | null }).email ?? null,
    last_history_id:
      (row as { last_history_id?: string | null }).last_history_id ?? null,
    updated_at: (row as { updated_at?: string | null }).updated_at ?? null,
  }));
  return { accounts: cursors.length, cursors, warning: null as string | null };
}

export async function GET(_req: NextRequest) {
  const warnings: string[] = [];
  const environment = getRuntimeEnvironment();

  let jobsSnapshot = {
    total: null as number | null,
    relevant: null as number | null,
    distinctOpenRoleCompanies: null as number | null,
    latestPostedAt: null as string | null,
  };
  let ingestSnapshot: {
    latestRun: SyncRunSummary | null;
    lastSuccessfulIngestAt: string | null;
    runsTable: "job_ingest_runs" | "sync_runs" | null;
  } = { latestRun: null, lastSuccessfulIngestAt: null, runsTable: null };
  let gmailSnapshot = {
    accounts: null as number | null,
    cursors: [] as Array<{ email: string | null; last_history_id: string | null; updated_at: string | null }>,
  };

  try {
    const jobs = await fetchJobsSnapshot();
    warnings.push(...jobs.warnings);
    jobsSnapshot = {
      total: jobs.total,
      relevant: jobs.relevant,
      distinctOpenRoleCompanies: jobs.distinctOpenRoleCompanies,
      latestPostedAt: jobs.latestPostedAt,
    };
  } catch (err) {
    warnings.push(`jobs snapshot threw: ${(err as Error).message}`);
  }

  try {
    const ingest = await fetchSyncRunSummary();
    ingestSnapshot = {
      latestRun: ingest.latest,
      lastSuccessfulIngestAt: ingest.lastSuccessfulAt,
      runsTable: ingest.table,
    };
  } catch (err) {
    warnings.push(`ingest snapshot threw: ${(err as Error).message}`);
  }

  try {
    const gmail = await fetchGmailSnapshot();
    if (gmail.warning) warnings.push(gmail.warning);
    gmailSnapshot = { accounts: gmail.accounts, cursors: gmail.cursors };
  } catch (err) {
    warnings.push(`gmail snapshot threw: ${(err as Error).message}`);
  }

  const payload: DiagnosticsPayload = {
    ok: warnings.length === 0,
    environment,
    jobs: jobsSnapshot,
    ingest: ingestSnapshot,
    gmail: gmailSnapshot,
    warnings,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
