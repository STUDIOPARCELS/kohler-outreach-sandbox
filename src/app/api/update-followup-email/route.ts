import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  const { letterId, email } = await req.json();
  if (!letterId || !email) {
    return NextResponse.json({ error: "letterId and email required" }, { status: 400 });
  }

  // Update the letter's contact_email
  const { error } = await supabaseAdmin
    .from("reachout_company_inserts")
    .update({ contact_email: email })
    .eq("id", letterId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also update the contacts table if the contact exists
  const { data: letter } = await supabaseAdmin
    .from("reachout_company_inserts")
    .select("companyname, contactname")
    .eq("id", letterId)
    .single();

  if (letter?.contactname) {
    await supabaseAdmin
      .from("contacts")
      .update({ email })
      .eq("companyname", letter.companyname)
      .eq("contactname", letter.contactname);
  }

  return NextResponse.json({ success: true });
}
