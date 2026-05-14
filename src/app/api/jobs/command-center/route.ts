// Phase 6 — Open Roles command center API.
//
// GET /api/jobs/command-center
//   Returns a per-company roll-up plus per-job rows enriched with the
//   Phase 5 fit score and contact/outreach status. Backwards-compatible
//   with environments where role_fit_scores has not yet been migrated —
//   missing scores are returned as null and the page renders gracefully.

import { NextRequest, NextResponse } from "next/server";
import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  scoreJobForKohler,
  SCORE_VERSION,
  type RoleFitScore,
} from "@/lib/kohlerFitScore";

export const dynamic = "force-dynamic";

interface JobRow {
  id: number;
  companyname: string;
  company_id: number | null;
  title: string;
  location: string | null;
  source: string | null;
  summary: string | null; // long-form text (was body_text/description)
  niche?: string | null; // hydrated from companies after the query
  job_url: string | null;
  apply_url: string | null;
  match_score: number | null;
  is_relevant: boolean | null;
  relevance_reason: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  ingest_status: string | null;
  // Compatibility shims for downstream code that still expects the old
  // names — both alias to summary so downstream score calls work.
  body_text?: string | null;
  description?: string | null;
  source_url?: string | null;
  closed_at?: string | null;
}

interface CompanyRow {
  id: number;
  companyname: string;
  city: string | null;
  niche: string | null;
  careers_url: string | null;
}

interface FitRow {
  job_listing_id: string;
  skill_fit_score: number;
  entry_level_score: number;
  pe_track_score: number;
  niche_score: number;
  location_score: number;
  mines_signal_score: number;
  overall_score: number;
  recommended_action: string;
  explanation_json: unknown;
}

interface ContactSummary {
  count: number;
  emailCount: number;
  bestContactName: string | null;
  bestContactTitle: string | null;
  bestContactEmail: string | null;
}

interface OutreachSummary {
  draftCount: number;
  printedCount: number;
  sentCount: number;
  lastDraftAt: string | null;
}

async function selectMaybe<T>(
  thenable: PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const { data, error } = await thenable;
  if (error) {
    if (/does not exist/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 250), 1000);
  const sortParam = (url.searchParams.get("sort") ?? "overall").toLowerCase();

  // Only request columns that actually exist on live job_listings.
  // Niche lives on companies (hydrated below). Long-form text is in
  // `summary`, not body_text/description. source_url and closed_at
  // are not yet on this table (Session D adds them).
  const jobs = await selectMaybe<JobRow>(
    supabaseAdmin
      .from("job_listings")
      .select(
        "id, companyname, company_id, title, location, source, summary, job_url, apply_url, match_score, is_relevant, relevance_reason, first_seen_at, last_seen_at, ingest_status"
      )
      .eq("is_relevant", true)
      .neq("ingest_status", "closed")
      // job_listings has no `created_at` — use received_at as the
      // chronological proxy.
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(limit)
  );

  const companyIds = Array.from(
    new Set(jobs.map((j) => j.company_id).filter((id): id is number => !!id))
  );
  const companyNames = Array.from(new Set(jobs.map((j) => j.companyname)));

  const companies =
    companyIds.length > 0
      ? await selectMaybe<CompanyRow>(
          supabaseAdmin
            .from("companies")
            .select("id, companyname, city, niche, careers_url")
            .in("id", companyIds)
        )
      : [];

  const companyById = new Map<number, CompanyRow>(companies.map((c) => [c.id, c]));

  // Live role_fit_scores has job_listing_id (text), NOT job_id (int).
  // Filter by current score_version so v1 historical rows don't compete
  // with the v2 production scores.
  const jobIdStrings = jobs.map((j) => String(j.id));
  const fitScores =
    jobIdStrings.length > 0
      ? await selectMaybe<FitRow>(
          supabaseAdmin
            .from("role_fit_scores")
            .select(
              "job_listing_id, skill_fit_score, entry_level_score, pe_track_score, niche_score, location_score, mines_signal_score, overall_score, recommended_action, explanation_json"
            )
            .eq("score_version", SCORE_VERSION)
            .in("job_listing_id", jobIdStrings)
        )
      : [];
  // Build lookup by integer job id for the rest of the route's logic.
  const fitByJob = new Map<number, FitRow>();
  for (const row of fitScores) {
    const id = Number((row as unknown as { job_listing_id: string }).job_listing_id);
    if (Number.isFinite(id)) fitByJob.set(id, row);
  }

  const contacts = companyNames.length > 0
    ? await selectMaybe<{ companyname: string; full_name: string | null; title: string | null; email: string | null }>(
        supabaseAdmin
          .from("contacts")
          .select("companyname, full_name, title, email")
          .in("companyname", companyNames)
      )
    : [];

  const contactByCompany = new Map<string, ContactSummary>();
  for (const c of contacts) {
    const summary = contactByCompany.get(c.companyname) ?? {
      count: 0,
      emailCount: 0,
      bestContactName: null,
      bestContactTitle: null,
      bestContactEmail: null,
    };
    summary.count++;
    if (c.email) {
      summary.emailCount++;
      if (!summary.bestContactEmail) {
        summary.bestContactName = c.full_name;
        summary.bestContactTitle = c.title;
        summary.bestContactEmail = c.email;
      }
    } else if (!summary.bestContactName) {
      summary.bestContactName = c.full_name;
      summary.bestContactTitle = c.title;
    }
    contactByCompany.set(c.companyname, summary);
  }

  const outreaches = companyNames.length > 0
    ? await selectMaybe<{ companyname: string; status: string | null; created_at: string | null }>(
        supabaseAdmin
          .from("reachout_company_inserts")
          .select("companyname, status, created_at")
          .in("companyname", companyNames)
      )
    : [];

  const outreachByCompany = new Map<string, OutreachSummary>();
  for (const o of outreaches) {
    const summary = outreachByCompany.get(o.companyname) ?? {
      draftCount: 0,
      printedCount: 0,
      sentCount: 0,
      lastDraftAt: null,
    };
    const status = (o.status || "").toLowerCase();
    if (status === "sent" || status === "approved") summary.sentCount++;
    else if (status === "printed") summary.printedCount++;
    else summary.draftCount++;
    if (o.created_at && (!summary.lastDraftAt || o.created_at > summary.lastDraftAt)) {
      summary.lastDraftAt = o.created_at;
    }
    outreachByCompany.set(o.companyname, summary);
  }

  // Inline-score any job missing a persisted fit score so the UI is never
  // blank pre-migration.
  function fitFor(job: JobRow): RoleFitScore | (FitRow & { fallback: true }) | null {
    const persisted = fitByJob.get(job.id);
    if (persisted) return persisted as FitRow as never;
    const inline = scoreJobForKohler({
      title: job.title,
      body_text: job.body_text,
      description: job.description,
      location: job.location,
      niche: job.niche,
      company_name: job.companyname,
      match_score: job.match_score,
      is_relevant: job.is_relevant,
      match_reason: job.relevance_reason,
      job_url: job.job_url,
      apply_url: job.apply_url,
    });
    return { ...inline, job_id: job.id, fallback: true } as never;
  }

  const enrichedJobs = jobs.map((job) => {
    const fit = fitFor(job);
    return {
      job,
      company: job.company_id ? companyById.get(job.company_id) ?? null : null,
      fit,
      contact: contactByCompany.get(job.companyname) ?? {
        count: 0,
        emailCount: 0,
        bestContactName: null,
        bestContactTitle: null,
        bestContactEmail: null,
      },
      outreach: outreachByCompany.get(job.companyname) ?? {
        draftCount: 0,
        printedCount: 0,
        sentCount: 0,
        lastDraftAt: null,
      },
    };
  });

  // Sort
  enrichedJobs.sort((a, b) => {
    if (sortParam === "pe") {
      return (b.fit?.pe_track_score ?? 0) - (a.fit?.pe_track_score ?? 0);
    }
    if (sortParam === "recent") {
      const aT = a.job.last_seen_at ?? a.job.first_seen_at ?? "";
      const bT = b.job.last_seen_at ?? b.job.first_seen_at ?? "";
      return bT.localeCompare(aT);
    }
    return (b.fit?.overall_score ?? 0) - (a.fit?.overall_score ?? 0);
  });

  // Per-company roll-up
  const companyRollups = new Map<
    string,
    {
      companyname: string;
      city: string | null;
      niche: string | null;
      careers_url: string | null;
      total_open_roles: number;
      best_overall_score: number;
      best_pe_score: number;
      best_recommended_action: string;
      best_role_title: string;
      best_role_id: number;
      sources: Set<string>;
      last_seen_at: string | null;
      contacts: ContactSummary;
      outreach: OutreachSummary;
    }
  >();

  for (const row of enrichedJobs) {
    const key = row.job.companyname;
    const overall = (row.fit as { overall_score?: number } | null)?.overall_score ?? 0;
    const pe = (row.fit as { pe_track_score?: number } | null)?.pe_track_score ?? 0;
    const action = (row.fit as { recommended_action?: string } | null)?.recommended_action ?? "monitor";
    const existing = companyRollups.get(key);
    if (!existing) {
      companyRollups.set(key, {
        companyname: row.job.companyname,
        city: row.company?.city ?? null,
        niche: row.company?.niche ?? row.job.niche ?? null,
        careers_url: row.company?.careers_url ?? null,
        total_open_roles: 1,
        best_overall_score: overall,
        best_pe_score: pe,
        best_recommended_action: action,
        best_role_title: row.job.title,
        best_role_id: row.job.id,
        sources: new Set([row.job.source ?? "unknown"]),
        last_seen_at: row.job.last_seen_at,
        contacts: row.contact,
        outreach: row.outreach,
      });
    } else {
      existing.total_open_roles++;
      if (overall > existing.best_overall_score) {
        existing.best_overall_score = overall;
        existing.best_recommended_action = action;
        existing.best_role_title = row.job.title;
        existing.best_role_id = row.job.id;
      }
      if (pe > existing.best_pe_score) existing.best_pe_score = pe;
      existing.sources.add(row.job.source ?? "unknown");
      if (row.job.last_seen_at && (!existing.last_seen_at || row.job.last_seen_at > existing.last_seen_at)) {
        existing.last_seen_at = row.job.last_seen_at;
      }
    }
  }

  const rollups = Array.from(companyRollups.values())
    .map((r) => ({ ...r, sources: Array.from(r.sources) }))
    .sort((a, b) => b.best_overall_score - a.best_overall_score);

  return NextResponse.json({
    sort: sortParam,
    counts: {
      total_jobs: enrichedJobs.length,
      total_companies: rollups.length,
      jobs_pe_signal: enrichedJobs.filter(
        (r) => ((r.fit as { pe_track_score?: number } | null)?.pe_track_score ?? 0) >= 10
      ).length,
      jobs_with_persisted_fit: enrichedJobs.filter(
        (r) => !(r.fit as { fallback?: boolean } | null)?.fallback
      ).length,
    },
    companies: rollups,
    jobs: enrichedJobs,
  });
}
