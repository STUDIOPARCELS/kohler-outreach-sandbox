#!/usr/bin/env node
// Nightly freshness probe for the outreach ingest pipeline.
//
// Reads sync_runs and job_listings through the Supabase REST API and exits
// non-zero when the pipeline looks dead:
//   (a) no sync_runs row with status completed/completed_with_errors in the
//       last 48 hours, OR
//   (b) any sync_runs row still in status "running" that started more than
//       2 hours ago (a killed run that never reached finishSyncRun), OR
//   (c) no job_listings row with last_seen_at (or first_seen_at) in the
//       last 72 hours.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (KOHLER_SUPABASE_URL / KOHLER_SUPABASE_KEY are accepted as overrides,
// mirroring src/lib/supabaseAdmin.ts precedence.)
//
// Usage: node scripts/check-freshness.mjs
// The decision logic is a pure function (evaluateFreshness) so it can be
// unit-tested without credentials: npm run test:freshness

import { pathToFileURL } from "node:url";

export const COMPLETED_RUN_MAX_AGE_HOURS = 48;
export const STUCK_RUNNING_MAX_AGE_HOURS = 2;
export const JOB_ACTIVITY_MAX_AGE_HOURS = 72;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Pure decision logic. Inputs are plain values so tests need no network.
 *
 * @param {object} input
 * @param {Date} input.now
 * @param {{ started_at: string, finished_at: string|null, status: string } | null} input.latestCompletedRun
 *   Most recent sync_runs row with status completed/completed_with_errors, or null if none exist.
 * @param {Array<{ id?: string, provider?: string, started_at: string }>} input.stuckRunningRuns
 *   sync_runs rows with status "running" started before now - 2h.
 * @param {boolean} input.hasRecentJobActivity
 *   True when any job_listings row has last_seen_at or first_seen_at within the last 72h.
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function evaluateFreshness({ now, latestCompletedRun, stuckRunningRuns, hasRecentJobActivity }) {
  const failures = [];

  const completedCutoff = now.getTime() - COMPLETED_RUN_MAX_AGE_HOURS * HOUR_MS;
  const completedAt = latestCompletedRun
    ? Date.parse(latestCompletedRun.finished_at || latestCompletedRun.started_at)
    : NaN;
  if (!Number.isFinite(completedAt) || completedAt < completedCutoff) {
    failures.push(
      latestCompletedRun
        ? `no completed sync run in the last ${COMPLETED_RUN_MAX_AGE_HOURS}h (latest: ${latestCompletedRun.finished_at || latestCompletedRun.started_at}, status ${latestCompletedRun.status})`
        : `no completed sync run in the last ${COMPLETED_RUN_MAX_AGE_HOURS}h (no completed/completed_with_errors rows found at all)`
    );
  }

  if (stuckRunningRuns.length > 0) {
    const oldest = stuckRunningRuns
      .map((run) => run.started_at)
      .sort()[0];
    failures.push(
      `${stuckRunningRuns.length} sync run(s) stuck in status "running" for over ${STUCK_RUNNING_MAX_AGE_HOURS}h (oldest started ${oldest})`
    );
  }

  if (!hasRecentJobActivity) {
    failures.push(
      `no job_listings row with last_seen_at or first_seen_at in the last ${JOB_ACTIVITY_MAX_AGE_HOURS}h`
    );
  }

  return { ok: failures.length === 0, failures };
}

async function restGet(baseUrl, key, pathAndQuery) {
  const url = `${baseUrl.replace(/\/$/, "")}/rest/v1/${pathAndQuery}`;
  const response = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GET ${pathAndQuery} -> HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

async function main() {
  const baseUrl = process.env.KOHLER_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.KOHLER_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !key) {
    console.error(
      "check-freshness: missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
    process.exit(2);
  }

  const now = new Date();
  const stuckCutoffIso = new Date(now.getTime() - STUCK_RUNNING_MAX_AGE_HOURS * HOUR_MS).toISOString();
  const jobCutoffIso = new Date(now.getTime() - JOB_ACTIVITY_MAX_AGE_HOURS * HOUR_MS).toISOString();

  const [latestCompletedRows, stuckRunningRuns, recentJobRows] = await Promise.all([
    restGet(
      baseUrl,
      key,
      "sync_runs?select=started_at,finished_at,status" +
        "&status=in.(completed,completed_with_errors)" +
        "&order=started_at.desc&limit=1"
    ),
    restGet(
      baseUrl,
      key,
      "sync_runs?select=id,provider,started_at" +
        `&status=eq.running&started_at=lt.${encodeURIComponent(stuckCutoffIso)}` +
        "&order=started_at.asc&limit=50"
    ),
    restGet(
      baseUrl,
      key,
      "job_listings?select=id" +
        `&or=(last_seen_at.gte.${encodeURIComponent(jobCutoffIso)},first_seen_at.gte.${encodeURIComponent(jobCutoffIso)})` +
        "&limit=1"
    ),
  ]);

  const result = evaluateFreshness({
    now,
    latestCompletedRun: latestCompletedRows[0] || null,
    stuckRunningRuns,
    hasRecentJobActivity: recentJobRows.length > 0,
  });

  if (result.ok) {
    console.log("check-freshness: OK — pipeline looks alive.");
    return;
  }

  console.error("check-freshness: FAILED");
  for (const failure of result.failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(`check-freshness: probe error — ${error.message}`);
    process.exit(1);
  });
}
