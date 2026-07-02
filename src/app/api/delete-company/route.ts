import { requireAppOrigin } from "@/lib/auth";
import { mustWrite } from "@/lib/dbGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const { companyname, confirm } = await req.json();

  if (!companyname) {
    return NextResponse.json({ error: "companyname required" }, { status: 400 });
  }

  if (!confirm) {
    return NextResponse.json({ error: "confirm: true required to delete" }, { status: 400 });
  }

  try {
    // Fetch all data before deleting (for undo support). A failed backup read
    // must abort the delete — otherwise "undo" would restore nothing.
    const { data: companyData, error: companyFetchError } = await supabaseAdmin
      .from("companies")
      .select("*")
      .eq("companyname", companyname)
      .maybeSingle();
    if (companyFetchError) {
      return NextResponse.json({ error: `backup fetch (company): ${companyFetchError.message}` }, { status: 500 });
    }

    const { data: contactsData, error: contactsFetchError } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("companyname", companyname);
    if (contactsFetchError) {
      return NextResponse.json({ error: `backup fetch (contacts): ${contactsFetchError.message}` }, { status: 500 });
    }

    const { data: lettersData, error: lettersFetchError } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select("*")
      .eq("companyname", companyname);
    if (lettersFetchError) {
      return NextResponse.json({ error: `backup fetch (letters): ${lettersFetchError.message}` }, { status: 500 });
    }

    // Delete contacts first (FK-safe)
    mustWrite("delete-company: contacts delete", await supabaseAdmin.from("contacts").delete().eq("companyname", companyname));

    // Delete any letters/drafts
    mustWrite("delete-company: letters delete", await supabaseAdmin
      .from("reachout_company_inserts")
      .delete()
      .eq("companyname", companyname));

    // Delete tracking entries
    mustWrite("delete-company: tracking delete", await supabaseAdmin.from("tracking").delete().eq("companyname", companyname));

    // Delete the company
    mustWrite("delete-company: company delete", await supabaseAdmin
      .from("companies")
      .delete()
      .eq("companyname", companyname));

    // Return deleted data so frontend can undo
    return NextResponse.json({
      success: true,
      deleted: companyname,
      backup: {
        company: companyData,
        contacts: (contactsData || []).map(({ id, ...rest }: Record<string, unknown>) => rest),
        letters: (lettersData || []).map(({ id, ...rest }: Record<string, unknown>) => rest),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
