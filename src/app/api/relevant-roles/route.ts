import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const companyname = req.nextUrl.searchParams.get("companyname");

  let query = supabaseAdmin.from("relevant_roles").select("*");
  if (companyname) {
    query = query.eq("company_name", companyname);
  }
  query = query.order("date_posted", { ascending: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
