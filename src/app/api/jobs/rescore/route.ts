import { requireApiSecret } from "@/lib/auth";
import { buildRoleFitScoreRow, persistRoleFitScore, type RoleFitJobRow } from "@/lib/roleFitScoreStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

interface ContactCount {
  contact_count: number;
  email_count: number;
}

function parseLimit(value: unknown): number {
  const parsed = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

async function loadContactCounts(companyNames: string[]): Promise<Map<string, ContactCount>> {
  if (companyNames.length === 0) return new Map();

  const { data } = await supabaseAdmin
    .from("contacts")
    .select("companyname, contactname, email")
    .in("companyname", companyNames);

  const counts = new Map<string, ContactCount>();
  for (const contact of data || []) {
    if (!contact.contactname || contact.contactname === "(no results)") continue;
    const entry = counts.get(contact.companyname) || { contact_count: 0, email_count: 0 };
    entry.contact_count++;
    if (contact.email) entry.email_count++;
    counts.set(contact.companyname, entry);
  }

  return counts;
}

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const limit = parseLimit(body.limit);
  const dryRun = body.dryRun !== false;
  const companyname = typeof body.companyname === "string" ? body.companyname : null;

  let query = supabaseAdmin
    .from("job_listings")
    .select("id, companyname, title, location, source, external_job_key, match_score, relevance_reason, ingest_status, is_relevant")
    .in("ingest_status", ["new", "open"])
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (body.onlyRelevant !== false) query = query.eq("is_relevant", true);
  if (companyname) query = query.eq("companyname", companyname);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobs = (data || []) as RoleFitJobRow[];
  const contactCounts = await loadContactCounts(Array.from(new Set(jobs.map((job) => job.companyname || "").filter(Boolean))));

  let persisted = 0;
  let missingTable = false;
  const errors: string[] = [];
  const samples: Array<{
    job_listing_id: string;
    companyname: string | null;
    title: string | null;
    overall_score: number;
    pe_track_score: number;
    recommended_action: string;
  }> = [];

  for (const job of jobs) {
    const counts = contactCounts.get(job.companyname || "") || { contact_count: 0, email_count: 0 };

    if (dryRun) {
      const { fit, row } = buildRoleFitScoreRow(job, counts);
      if (samples.length < 10) {
        samples.push({
          job_listing_id: row.job_listing_id,
          companyname: row.companyname,
          title: job.title || null,
          overall_score: fit.overall_score,
          pe_track_score: fit.pe_track_score,
          recommended_action: fit.recommended_action,
        });
      }
      continue;
    }

    const result = await persistRoleFitScore(job, counts);
    if (result.persisted) persisted++;
    if (result.missingTable) missingTable = true;
    if (result.error && errors.length < 10) errors.push(result.error);
    if (samples.length < 10) {
      samples.push({
        job_listing_id: result.row.job_listing_id,
        companyname: result.row.companyname,
        title: job.title || null,
        overall_score: result.fit.overall_score,
        pe_track_score: result.fit.pe_track_score,
        recommended_action: result.fit.recommended_action,
      });
    }
  }

  return NextResponse.json({
    dryRun,
    requested: jobs.length,
    persisted,
    missingTable,
    errors,
    samples,
  });
}
