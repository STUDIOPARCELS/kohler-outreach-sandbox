import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Get all companies (Supabase defaults to 1000 rows, so paginate)
  let allCompanies: { companyname: string; tier: number; city: string; company_key: string; company_about: string; niche: string }[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select("companyname, tier, city, company_key, company_about, niche")
      .order("tier", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) allCompanies = allCompanies.concat(data);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  const companies = allCompanies;

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
    return {
      ...co,
      contactname: contact?.contactname || null,
      contact_title: contact?.title || null,
      email: contact?.email || null,
      contact_count: contact?.contact_count || 0,
      email_count: contact?.email_count || 0,
    };
  });

  return NextResponse.json(rows);
}
