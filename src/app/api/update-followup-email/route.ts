import { requireAppOrigin } from "@/lib/auth";
import { mustWrite } from "@/lib/dbGuard";
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

  try {
    // Update the letter's contact_email
    mustWrite(
      "update-followup-email: letter contact_email update",
      await supabaseAdmin
        .from("reachout_company_inserts")
        .update({ contact_email: email })
        .eq("id", letterId)
    );

    // Also update the contacts table if the contact exists
    const { data: letter, error: letterError } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select("companyname, contactname")
      .eq("id", letterId)
      .maybeSingle();
    if (letterError) {
      return NextResponse.json({ error: letterError.message }, { status: 500 });
    }

    if (letter?.contactname) {
      mustWrite(
        "update-followup-email: contact email update",
        await supabaseAdmin
          .from("contacts")
          .update({ email })
          .eq("companyname", letter.companyname)
          .eq("contactname", letter.contactname)
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
