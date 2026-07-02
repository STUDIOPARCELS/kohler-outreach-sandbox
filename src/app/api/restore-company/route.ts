import { requireAppOrigin } from "@/lib/auth";
import { mustWrite } from "@/lib/dbGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const { company, contacts, letters } = await req.json();

  if (!company || !company.companyname) {
    return NextResponse.json({ error: "company data required" }, { status: 400 });
  }

  try {
    // Re-insert company
    const { error: compError } = await supabaseAdmin
      .from("companies")
      .insert(company);
    if (compError) {
      return NextResponse.json({ error: compError.message }, { status: 500 });
    }

    // Re-insert contacts
    if (contacts && contacts.length > 0) {
      mustWrite("restore-company: contacts insert", await supabaseAdmin.from("contacts").insert(contacts));
    }

    // Re-insert letters
    if (letters && letters.length > 0) {
      mustWrite("restore-company: letters insert", await supabaseAdmin.from("reachout_company_inserts").insert(letters));
    }

    return NextResponse.json({ success: true, restored: company.companyname });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
