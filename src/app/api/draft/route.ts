import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const companyname = req.nextUrl.searchParams.get("companyname");
  const contactname = req.nextUrl.searchParams.get("contactname");
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  // If contactname provided, look up specific contact's letter.
  // Newest-first + limit(1) keeps .maybeSingle() from erroring when legacy
  // duplicate rows exist for the same company + contact.
  if (contactname) {
    const { data, error } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select("*")
      .eq("companyname", companyname)
      .eq("contactname", contactname)
      .order("created_at", { ascending: false })
      .limit(1)
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
  const authError = requireAppOrigin(req); if (authError) return authError;
  const body = await req.json();
  const { companyname, contactname, ...fields } = body;
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  // Per-contact tracking: look up by companyname + contactname.
  // A failed lookup must return 500 — falling through to insert forks a
  // duplicate row while the UI keeps editing the original. Newest-first +
  // limit(1) keeps .maybeSingle() from erroring once duplicates exist.
  let existing = null;
  if (contactname) {
    const { data, error } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select("id")
      .eq("companyname", companyname)
      .eq("contactname", contactname)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    existing = data;
  }

  // If no contactname given, find any existing draft (for body_final updates)
  if (!existing && !contactname) {
    const { data, error } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select("id")
      .eq("companyname", companyname)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    existing = data;
  }

  let result;
  if (existing) {
    // Don't overwrite body_final with null if one is already saved
    const updateFields = { contactname: contactname || null, ...fields, updated_at: new Date().toISOString() };
    if (fields.body_final === null || fields.body_final === undefined) {
      delete updateFields.body_final;
    }
    result = await supabaseAdmin
      .from("reachout_company_inserts")
      .update(updateFields)
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
