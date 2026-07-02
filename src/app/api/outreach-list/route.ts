import { requireAppOrigin } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { computeOutreachScore } from "@/lib/outreachScore";
import { getReliableJobUrl } from "@/lib/jobLinks";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isExcludedStaffingCompany, isTodayExcludedNiche, isTodayTargetJob, normalizeNiche } from "@/lib/targeting";
import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface CompanyRow {
  companyname: string;
  tier: number;
  city: string;
  company_key: string;
  company_about: string;
  niche: string;
  mailing_zip: string;
  careers_url: string | null;
}

interface JobRow {
  companyname: string;
  title: string | null;
  location: string | null;
  source: string | null;
  job_url: string | null;
  apply_url: string | null;
  is_relevant: boolean | null;
  ingest_status: string | null;
}

interface ContactRow {
  companyname: string;
  contactname: string | null;
  title: string;
  email: string;
}

async function buildOutreachList(includeExcluded: boolean) {
  const [allCompanies, trackedJobs, contacts] = await Promise.all([
    fetchAllRows<CompanyRow>(
      (from, to) =>
        supabaseAdmin
          .from("companies")
          .select("companyname, tier, city, company_key, company_about, niche, mailing_zip, careers_url")
          .order("id", { ascending: true })
          .range(from, to),
      "companies scan"
    ),
    fetchAllRows<JobRow>(
      (from, to) =>
        supabaseAdmin
          .from("job_listings")
          .select("companyname, title, location, source, job_url, apply_url, is_relevant, ingest_status")
          .eq("is_relevant", true)
          .in("ingest_status", ["new", "open"])
          .order("id", { ascending: true })
          .range(from, to),
      "job_listings scan"
    ),
    fetchAllRows<ContactRow>(
      (from, to) =>
        supabaseAdmin
          .from("contacts")
          .select("companyname, contactname, title, email")
          .order("id", { ascending: true })
          .range(from, to),
      "contacts scan"
    ),
  ]);

  const jobTitleMap = new Map<string, string[]>();
  const roleCountMap = new Map<string, number>();
  for (const job of trackedJobs) {
    const reliableUrl = getReliableJobUrl(job);
    if (!reliableUrl || !isTodayTargetJob({
      title: job.title,
      companyname: job.companyname,
      location: job.location,
      is_relevant: job.is_relevant,
      job_url: reliableUrl,
    })) continue;
    const titles = jobTitleMap.get(job.companyname) || [];
    if (job.title) titles.push(job.title);
    jobTitleMap.set(job.companyname, titles);
    roleCountMap.set(job.companyname, (roleCountMap.get(job.companyname) || 0) + 1);
  }

  // Build a map of best contact per company + counts
  const contactMap = new Map<
    string,
    { contactname: string; title: string; email: string; contact_count: number; email_count: number }
  >();
  // First pass: count contacts and emails per company
  const counts = new Map<string, { total: number; withEmail: number }>();
  for (const c of contacts) {
    if (!c.contactname || c.contactname === "(no results)") continue;
    const cur = counts.get(c.companyname) || { total: 0, withEmail: 0 };
    cur.total++;
    if (c.email) cur.withEmail++;
    counts.set(c.companyname, cur);
  }

  for (const c of contacts) {
    if (!c.contactname || c.contactname === "(no results)") continue;
    const existing = contactMap.get(c.companyname);
    const cnt = counts.get(c.companyname) || { total: 0, withEmail: 0 };
    if (
      !existing ||
      (c.email && !existing.email) ||
      (!existing.email && c.contactname)
    ) {
      contactMap.set(c.companyname, {
        contactname: c.contactname,
        title: c.title,
        email: c.email,
        contact_count: cnt.total,
        email_count: cnt.withEmail,
      });
    }
  }

  // Merge — one pass per company so normalizeNiche runs once, not twice
  const rows = [];
  for (const co of allCompanies) {
    const niche = normalizeNiche(co.niche, co.companyname, jobTitleMap.get(co.companyname)?.join(" "));
    if (!includeExcluded && (isTodayExcludedNiche(niche) || isExcludedStaffingCompany(co.companyname))) continue;
    const contact = contactMap.get(co.companyname);
    const roles = roleCountMap.get(co.companyname) || 0;
    const contact_count = contact?.contact_count || 0;
    const email_count = contact?.email_count || 0;
    const score = computeOutreachScore({
      tier: co.tier,
      niche,
      city: co.city,
      mailing_zip: co.mailing_zip,
      careers_url: co.careers_url,
      roles,
      contact_count,
      email_count,
    });
    rows.push({
      ...co,
      niche,
      roles,
      contactname: contact?.contactname || null,
      contact_title: contact?.title || null,
      email: contact?.email || null,
      contact_count,
      email_count,
      ...score,
    });
  }
  rows.sort((a, b) => b.outreach_score - a.outreach_score || a.companyname.localeCompare(b.companyname));
  return rows;
}

// The list only changes at cron cadence, not per view — serve it stale up to 60s.
const getCachedOutreachList = unstable_cache(buildOutreachList, ["outreach-list"], { revalidate: 60 });

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const includeExcluded = req.nextUrl.searchParams.get("includeExcluded") === "1";
  try {
    const rows = await getCachedOutreachList(includeExcluded);
    return NextResponse.json(rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
