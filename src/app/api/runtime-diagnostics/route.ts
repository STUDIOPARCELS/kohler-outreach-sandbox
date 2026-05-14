import { requireAppOrigin } from "@/lib/auth";
import { getRuntimeEnvironment } from "@/lib/runtimeEnvironment";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface JobDiagnosticRow {
  companyname: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  source: string | null;
  parser_version: number | null;
}

async function getJobDiagnostics() {
  const { data, count, error } = await supabaseAdmin
    .from("job_listings")
    .select("companyname, first_seen_at, last_seen_at, source, parser_version", { count: "exact" })
    .in("ingest_status", ["new", "open"])
    .eq("is_relevant", true)
    .order("last_seen_at", { ascending: false })
    .limit(1000);

  if (error) {
    return { status: "unavailable", error: error.message };
  }

  const rows = (data || []) as JobDiagnosticRow[];
  const companyNames = new Set(rows.map((row) => row.companyname).filter(Boolean));
  const sourceCounts: Record<string, number> = {};
  for (const row of rows) {
    const source = row.source || "unknown";
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  }

  return {
    status: "ok",
    latestJobCount: count ?? rows.length,
    latestOpenRoleCompanyCount: companyNames.size,
    latestJobSeenAt: rows.find((row) => row.last_seen_at || row.first_seen_at)?.last_seen_at ||
      rows.find((row) => row.first_seen_at)?.first_seen_at ||
      null,
    latestParserVersion: rows.find((row) => row.parser_version !== null)?.parser_version ?? null,
    sourceCounts,
  };
}

async function getLatestSyncRun() {
  const { data, error } = await supabaseAdmin
    .from("job_ingest_runs")
    .select("id, status, started_at, finished_at, messages_seen, jobs_extracted, error_text")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { status: "unavailable", error: error.message };
  if (!data) return { status: "none" };

  return {
    status: "ok",
    run: {
      id: data.id,
      runStatus: data.status,
      startedAt: data.started_at,
      finishedAt: data.finished_at,
      messagesSeen: data.messages_seen,
      jobsExtracted: data.jobs_extracted,
      hasError: Boolean(data.error_text),
    },
  };
}

async function getGmailCursorStatus() {
  const { data, error } = await supabaseAdmin
    .from("gmail_accounts")
    .select("last_history_id, updated_at")
    .limit(1)
    .maybeSingle();

  if (error) return { status: "unavailable", error: error.message };
  if (!data) return { status: "not_connected" };

  return {
    status: data.last_history_id ? "cursor_set" : "cursor_missing",
    updatedAt: data.updated_at,
  };
}

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  const [jobs, latestSyncRun, gmail] = await Promise.all([
    getJobDiagnostics(),
    getLatestSyncRun(),
    getGmailCursorStatus(),
  ]);

  const latestSync = latestSyncRun.status === "ok" ? latestSyncRun.run : null;
  const lastSuccessfulIngestAt =
    latestSync?.runStatus && ["completed", "replay_completed"].includes(latestSync.runStatus)
      ? latestSync.finishedAt
      : jobs.status === "ok"
        ? jobs.latestJobSeenAt
        : null;

  return NextResponse.json({
    runtime: getRuntimeEnvironment(),
    jobs,
    latestSyncRun,
    gmail,
    lastSuccessfulIngestAt,
    generatedAt: new Date().toISOString(),
  });
}
