import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const companyname = req.nextUrl.searchParams.get("companyname");
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("reachout_company_inserts")
    .select("*")
    .eq("companyname", companyname)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companyname, ...fields } = body;
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  // Check if draft exists
  const { data: existing } = await supabaseAdmin
    .from("reachout_company_inserts")
    .select("id")
    .eq("companyname", companyname)
    .maybeSingle();

  let result;
  if (existing) {
    result = await supabaseAdmin
      .from("reachout_company_inserts")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("companyname", companyname)
      .select()
      .single();
  } else {
    result = await supabaseAdmin
      .from("reachout_company_inserts")
      .insert({
        companyname,
        custom_paragraph: fields.custom_paragraph || "",
        status: fields.status || "draft",
        ...fields,
      })
      .select()
      .single();
  }

  if (result.error)
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json(result.data);
}
