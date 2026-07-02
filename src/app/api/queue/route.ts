import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

// Everything the dashboard grid actually reads. Letter bodies (body_final,
// subject_final, custom_paragraph, job_skills_matched) ship only with ?full=1
// — on the default load path they grow the payload forever for nothing.
const SLIM_COLUMNS =
  "id, companyname, contactname, contact_title, contact_email, status, printed_at, sent_at, emailed_at, followup2_at, job_title, created_at";

// The select string is chosen at runtime, so postgrest-js can't infer row
// types from it — declare what both shapes share.
interface QueueRow {
  companyname: string;
  mailing_address1?: string;
  mailing_address2?: string;
  mailing_city?: string;
  mailing_state?: string;
  mailing_zip?: string;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const status = req.nextUrl.searchParams.get("status");
  const ids = req.nextUrl.searchParams.get("ids");
  const full = req.nextUrl.searchParams.get("full") === "1";

  let query = supabaseAdmin
    .from("reachout_company_inserts")
    .select(full ? "*" : SLIM_COLUMNS)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (ids) {
    const idList = ids.split(",").filter(Boolean);
    query = query.in("id", idList);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data || []) as unknown as QueueRow[];

  // Enrich with company address data (only the full shape is used for
  // printing; the slim dashboard payload never reads addresses)
  if (full && rows.length > 0) {
    const names = rows.map((d) => d.companyname);
    const { data: companies } = await supabaseAdmin
      .from("companies")
      .select("companyname, mailing_address1, mailing_address2, mailing_city, mailing_state, mailing_zip")
      .in("companyname", names);

    if (companies) {
      const addrMap = new Map(companies.map((c: { companyname: string; mailing_address1?: string; mailing_address2?: string; mailing_city?: string; mailing_state?: string; mailing_zip?: string }) => [c.companyname, c]));
      for (const row of rows) {
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

  return NextResponse.json(rows);
}
