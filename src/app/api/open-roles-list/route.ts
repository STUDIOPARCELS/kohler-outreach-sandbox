import { requireAppOrigin } from "@/lib/auth";
import { getReliableJobUrl } from "@/lib/jobLinks";
import { computeOutreachScore } from "@/lib/outreachScore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isTodayTargetJob, normalizeNiche } from "@/lib/targeting";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const sourceFilter = req.nextUrl.searchParams.get("source");

  let query = supabaseAdmin
    .from("job_listings")
    .select("companyname, company_id, title, job_url, apply_url, source, ingest_status, is_relevant, first_seen_at, last_seen_at, times_seen")
    .in("ingest_status", ["new", "open"])
    .eq("is_relevant", true);

  if (sourceFilter === "career_pages") {
    query = query.in("source", ["jsonld_careers", "career_links_careers"]);
  } else if (sourceFilter === "government") {
    query = query.in("source", ["governmentjobs_email", "governmentjobs_direct", "usajobs"]);
  } else if (sourceFilter && sourceFilter !== "all") {
    query = query.eq("source", sourceFilter);
  }

  const { data: allJobs, error } = await query;

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const prelimJobs = (allJobs || [])
    .map((job) => ({ ...job, reliable_url: getReliableJobUrl(job) }))
    .filter((job) =>
      job.reliable_url && isTodayTargetJob({
      title: job.title,
      companyname: job.companyname,
      is_relevant: job.is_relevant,
      job_url: job.reliable_url,
    })
  );

  // Enrich with companies table data where available, then apply niche exclusions.
  const namesForDetails = Array.from(new Set(prelimJobs.map((job) => job.companyname).filter(Boolean)));
  const { data: companyDetails } = namesForDetails.length > 0
    ? await supabaseAdmin
        .from("companies")
        .select("companyname, tier, city, niche, mailing_zip, careers_url")
        .in("companyname", namesForDetails)
    : { data: [] };

  const detailMap = new Map<string, { tier: number; city: string; niche: string; mailing_zip: string | null; careers_url: string | null }>();
  for (const c of companyDetails || []) {
    detailMap.set(c.companyname, { tier: c.tier, city: c.city, niche: c.niche, mailing_zip: c.mailing_zip, careers_url: c.careers_url });
  }

  const { data: contacts } = namesForDetails.length > 0
    ? await supabaseAdmin
        .from("contacts")
        .select("companyname, contactname, email")
        .in("companyname", namesForDetails)
    : { data: [] };

  const contactMap = new Map<string, { contact_count: number; email_count: number }>();
  for (const contact of contacts || []) {
    if (!contact.contactname || contact.contactname === "(no results)") continue;
    const entry = contactMap.get(contact.companyname) || { contact_count: 0, email_count: 0 };
    entry.contact_count++;
    if (contact.email) entry.email_count++;
    contactMap.set(contact.companyname, entry);
  }

  const titleMap = new Map<string, string[]>();
  for (const job of prelimJobs) {
    const titles = titleMap.get(job.companyname) || [];
    if (job.title) titles.push(job.title);
    titleMap.set(job.companyname, titles);
  }

  const jobs = prelimJobs.filter((job) =>
    isTodayTargetJob({
      title: job.title,
      companyname: job.companyname,
      niche: normalizeNiche(detailMap.get(job.companyname)?.niche, job.companyname, titleMap.get(job.companyname)?.join(" ")),
      is_relevant: job.is_relevant,
      job_url: job.reliable_url,
    })
  );

  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const totalRoles = jobs.length;
  const newRoles24h = jobs.filter(j => j.first_seen_at && new Date(j.first_seen_at) >= h24).length;
  const updatedExisting24h = jobs.filter(j =>
    j.last_seen_at && new Date(j.last_seen_at) >= h24 &&
    j.first_seen_at && new Date(j.first_seen_at) < h24
  ).length;
  const newZR24h = jobs.filter(j => j.source === "ziprecruiter_email" && j.first_seen_at && new Date(j.first_seen_at) >= h24).length;
  const newGov24h = jobs.filter(j =>
    ["governmentjobs_email", "governmentjobs_direct", "usajobs"].includes(j.source || "") &&
    j.first_seen_at && new Date(j.first_seen_at) >= h24
  ).length;
  const newRoles7d = jobs.filter(j => j.first_seen_at && new Date(j.first_seen_at) >= d7).length;
  const newRoles30d = jobs.filter(j => j.first_seen_at && new Date(j.first_seen_at) >= d30).length;

  const bySource: Record<string, number> = {};
  for (const j of jobs) {
    const source = j.source || "unknown";
    bySource[source] = (bySource[source] || 0) + 1;
  }

  // Build company list from job_listings directly (not dependent on companies table)
  const companyMap = new Map<string, { roles: number; company_id: number | null }>();
  for (const j of jobs) {
    const existing = companyMap.get(j.companyname);
    if (existing) {
      existing.roles++;
    } else {
      companyMap.set(j.companyname, { roles: 1, company_id: j.company_id });
    }
  }

  const companyNames = Array.from(companyMap.keys());

  const rows = companyNames.map(name => {
    const entry = companyMap.get(name)!;
    const detail = detailMap.get(name);
    const niche = normalizeNiche(detail?.niche, name, titleMap.get(name)?.join(" "));
    const contactCounts = contactMap.get(name) || { contact_count: 0, email_count: 0 };
    const score = computeOutreachScore({
      tier: detail?.tier,
      niche,
      city: detail?.city,
      mailing_zip: detail?.mailing_zip,
      careers_url: detail?.careers_url,
      roles: entry.roles,
      contact_count: contactCounts.contact_count,
      email_count: contactCounts.email_count,
    });
    return {
      companyname: name,
      tier: detail?.tier || 5,
      city: detail?.city || null,
      niche,
      roles: entry.roles,
      contact_count: contactCounts.contact_count,
      email_count: contactCounts.email_count,
      ...score,
    };
  }).sort((a, b) => b.outreach_score - a.outreach_score || b.roles - a.roles || a.companyname.localeCompare(b.companyname));

  return NextResponse.json({
    stats: {
      totalRoles,
      companies: companyMap.size,
      newRoles24h,
      updatedExisting24h,
      newRoles7d,
      newRoles30d,
      newZR24h,
      newGov24h,
      bySource,
    },
    companies: rows,
  });
}
