import { requireAppOrigin } from "@/lib/auth";
import { computeOutreachScore } from "@/lib/outreachScore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isExcludedStaffingCompany, isTodayExcludedNiche, normalizeNiche } from "@/lib/targeting";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const includeExcluded = req.nextUrl.searchParams.get("includeExcluded") === "1";
  // Get all companies (Supabase defaults to 1000 rows, so paginate)
  let allCompanies: { companyname: string; tier: number; city: string; company_key: string; company_about: string; niche: string; mailing_zip: string; careers_url: string | null }[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select("companyname, tier, city, company_key, company_about, niche, mailing_zip, careers_url")
      .order("tier", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) allCompanies = allCompanies.concat(data);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  const { data: trackedJobs } = await supabaseAdmin
    .from("job_listings")
    .select("companyname, title, is_relevant, ingest_status")
    .eq("is_relevant", true)
    .in("ingest_status", ["new", "open"]);

  const jobTitleMap = new Map<string, string[]>();
  const roleCountMap = new Map<string, number>();
  for (const job of trackedJobs || []) {
    const titles = jobTitleMap.get(job.companyname) || [];
    if (job.title) titles.push(job.title);
    jobTitleMap.set(job.companyname, titles);
    roleCountMap.set(job.companyname, (roleCountMap.get(job.companyname) || 0) + 1);
  }

  const companies = includeExcluded
    ? allCompanies
    : allCompanies.filter((company) => {
        const niche = normalizeNiche(company.niche, company.companyname, jobTitleMap.get(company.companyname)?.join(" "));
        return !isTodayExcludedNiche(niche) && !isExcludedStaffingCompany(company.companyname);
      });

  // Get all contacts to find best contact per company
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("companyname, contactname, title, email");

  // Build a map of best contact per company + counts
  const contactMap = new Map<
    string,
    { contactname: string; title: string; email: string; contact_count: number; email_count: number }
  >();
  if (contacts) {
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
  }

  // Merge
  const rows = (companies || []).map((co) => {
    const contact = contactMap.get(co.companyname);
    const niche = normalizeNiche(co.niche, co.companyname, jobTitleMap.get(co.companyname)?.join(" "));
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
    return {
      ...co,
      niche,
      roles,
      contactname: contact?.contactname || null,
      contact_title: contact?.title || null,
      email: contact?.email || null,
      contact_count,
      email_count,
      ...score,
    };
  }).sort((a, b) => b.outreach_score - a.outreach_score || a.companyname.localeCompare(b.companyname));

  return NextResponse.json(rows);
}
