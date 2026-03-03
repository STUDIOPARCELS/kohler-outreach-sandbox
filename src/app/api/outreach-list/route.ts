import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  // Get all companies
  const { data: companies, error: compErr } = await supabaseAdmin
    .from("companies")
    .select("companyname, tier, city, company_key, company_about, niche")
    .order("tier", { ascending: true });

  if (compErr)
    return NextResponse.json({ error: compErr.message }, { status: 500 });

  // Get all contacts to find best contact per company
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("companyname, contactname, title, email");

  // Build a map of best contact per company
  const contactMap = new Map<
    string,
    { contactname: string; title: string; email: string }
  >();
  if (contacts) {
    for (const c of contacts) {
      const existing = contactMap.get(c.companyname);
      if (
        !existing ||
        (c.email && !existing.email) ||
        (!existing.email && c.contactname)
      ) {
        contactMap.set(c.companyname, {
          contactname: c.contactname,
          title: c.title,
          email: c.email,
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
    };
  });

  return NextResponse.json(rows);
}
