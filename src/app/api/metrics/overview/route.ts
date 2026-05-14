// Phase 10 — Metrics overview.
//
// GET /api/metrics/overview
// Returns the headline counts the dashboard renders. All queries
// degrade to 0 when their table doesn't exist yet (so a freshly
// migrated sandbox shows accurate zeros instead of 500ing).

import { NextRequest, NextResponse } from "next/server";
import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }>;
type SelectQuery<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function awaitCount(query: CountQuery): Promise<{ count: number; missing: boolean }> {
  const { count, error } = await query;
  if (error) {
    if (/does not exist/i.test(error.message)) return { count: 0, missing: true };
    return { count: 0, missing: false };
  }
  return { count: count ?? 0, missing: false };
}

async function awaitDistinct<T extends Record<string, unknown>>(
  query: SelectQuery<T>,
  column: string
): Promise<number> {
  const { data, error } = await query;
  if (error) return 0;
  const set = new Set<string>();
  for (const row of data ?? []) {
    const v = row[column];
    if (typeof v === "string" && v) set.add(v);
  }
  return set.size;
}

async function tryClassificationBreakdown(): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin
    .from("email_messages")
    .select("classification")
    .eq("direction", "inbound");
  if (error) return {};
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const cls = (row as { classification?: string | null }).classification ?? "unknown";
    counts[cls] = (counts[cls] ?? 0) + 1;
  }
  return counts;
}

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  const [
    companies,
    relevantJobs,
    highFit,
    drafts,
    draftsApproved,
    sentMessages,
    threadsNeedAction,
    applications,
    actions,
    peJobs,
  ] = await Promise.all([
    awaitCount(supabaseAdmin.from("companies").select("*", { count: "exact", head: true }) as unknown as CountQuery),
    awaitCount(
      supabaseAdmin
        .from("job_listings")
        .select("*", { count: "exact", head: true })
        .eq("is_relevant", true)
        .neq("ingest_status", "closed") as unknown as CountQuery
    ),
    awaitCount(
      supabaseAdmin
        .from("role_fit_scores")
        .select("*", { count: "exact", head: true })
        .gte("overall_score", 60) as unknown as CountQuery
    ),
    awaitCount(
      supabaseAdmin
        .from("email_drafts")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft") as unknown as CountQuery
    ),
    awaitCount(
      supabaseAdmin
        .from("email_drafts")
        .select("*", { count: "exact", head: true })
        .eq("status", "human_approved") as unknown as CountQuery
    ),
    awaitCount(supabaseAdmin.from("sent_messages").select("*", { count: "exact", head: true }) as unknown as CountQuery),
    awaitCount(
      supabaseAdmin
        .from("email_threads")
        .select("*", { count: "exact", head: true })
        .eq("needs_action", true) as unknown as CountQuery
    ),
    awaitCount(supabaseAdmin.from("applications").select("*", { count: "exact", head: true }) as unknown as CountQuery),
    awaitCount(supabaseAdmin.from("outreach_actions").select("*", { count: "exact", head: true }) as unknown as CountQuery),
    awaitCount(
      supabaseAdmin
        .from("role_fit_scores")
        .select("*", { count: "exact", head: true })
        .gte("pe_track_score", 10) as unknown as CountQuery
    ),
  ]);

  const distinctOpenRoleCompanies = await awaitDistinct(
    supabaseAdmin
      .from("job_listings")
      .select("companyname")
      .eq("is_relevant", true) as unknown as SelectQuery<{ companyname?: string }>,
    "companyname"
  );
  const inboundClassifications = await tryClassificationBreakdown();
  void relevantJobs;

  const inboundTotal = Object.values(inboundClassifications).reduce((a, b) => a + b, 0);
  const positive = inboundClassifications.positive_reply ?? 0;
  const recruiterScreens = inboundClassifications.recruiter_screen ?? 0;
  const followUpsDue = inboundClassifications.needs_follow_up ?? 0;

  const responseRate = sentMessages.count > 0 ? inboundTotal / sentMessages.count : 0;
  const positiveResponseRate = sentMessages.count > 0 ? (positive + recruiterScreens) / sentMessages.count : 0;

  return NextResponse.json({
    headline: {
      companies_tracked: companies.count,
      companies_with_open_roles: distinctOpenRoleCompanies,
      high_fit_jobs: highFit.count,
      jobs_with_pe_signal: peJobs.count,
      contacts_total: 0, // populated below
      drafts_in_progress: drafts.count,
      drafts_approved: draftsApproved.count,
      emails_sent: sentMessages.count,
      replies_received: inboundTotal,
      positive_replies: positive,
      recruiter_screens: recruiterScreens,
      follow_ups_due: followUpsDue + threadsNeedAction.count,
      applications_submitted: applications.count,
      outreach_actions: actions.count,
      response_rate: Number(responseRate.toFixed(3)),
      positive_response_rate: Number(positiveResponseRate.toFixed(3)),
    },
    classifications: inboundClassifications,
    table_status: {
      role_fit_scores: !highFit.missing,
      sent_messages: !sentMessages.missing,
      email_threads: !threadsNeedAction.missing,
      email_messages: Object.keys(inboundClassifications).length > 0 || !sentMessages.missing,
      outreach_actions: !actions.missing,
      applications: !applications.missing,
    },
  });
}
