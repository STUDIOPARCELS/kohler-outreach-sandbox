import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const companyname = req.nextUrl.searchParams.get("companyname");
  const contactname = req.nextUrl.searchParams.get("contactname");
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  // If contactname provided, look up specific contact's letter
  if (contactname) {
    const { data, error } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select("*")
      .eq("companyname", companyname)
      .eq("contactname", contactname)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Otherwise return all letters for this company
  const { data, error } = await supabaseAdmin
    .from("reachout_company_inserts")
    .select("*")
    .eq("companyname", companyname)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companyname, contactname, ...fields } = body;
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  // Per-contact tracking: look up by companyname + contactname
  let existing = null;
  if (contactname) {
    const { data } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select("id")
      .eq("companyname", companyname)
      .eq("contactname", contactname)
      .maybeSingle();
    existing = data;
  }

  // Fallback: if no contactname match, check for company-level draft without contact
  if (!existing && contactname) {
    const { data } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select("id, contactname")
      .eq("companyname", companyname)
      .is("contactname", null)
      .maybeSingle();
    existing = data;
  }

  // If still no match and no contactname given, find any existing draft
  if (!existing && !contactname) {
    const { data } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select("id")
      .eq("companyname", companyname)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    existing = data;
  }

  let result;
  if (existing) {
    result = await supabaseAdmin
      .from("reachout_company_inserts")
      .update({ contactname: contactname || null, ...fields, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
  } else {
    result = await supabaseAdmin
      .from("reachout_company_inserts")
      .insert({
        companyname,
        contactname: contactname || null,
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
