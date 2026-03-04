import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const ids = req.nextUrl.searchParams.get("ids");

  let query = supabaseAdmin
    .from("reachout_company_inserts")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (ids) {
    const idList = ids.split(",").filter(Boolean);
    query = query.in("id", idList);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with company address data
  if (data && data.length > 0) {
    const names = data.map((d: { companyname: string }) => d.companyname);
    const { data: companies } = await supabaseAdmin
      .from("companies")
      .select("companyname, mailing_address1, mailing_address2, mailing_city, mailing_state, mailing_zip")
      .in("companyname", names);

    if (companies) {
      const addrMap = new Map(companies.map((c: { companyname: string; mailing_address1?: string; mailing_address2?: string; mailing_city?: string; mailing_state?: string; mailing_zip?: string }) => [c.companyname, c]));
      for (const row of data) {
        const addr = addrMap.get(row.companyname);
        if (addr) {
          row.mailing_address1 = addr.mailing_address1 || "";
          row.mailing_address2 = addr.mailing_address2 || "";
          row.mailing_city = addr.mailing_city || "";
          row.mailing_state = addr.mailing_state || "";
          row.mailing_zip = addr.mailing_zip || "";
        }
      }
    }
  }

  return NextResponse.json(data || []);
}
