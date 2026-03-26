import { requireAppOrigin } from "@/lib/auth";
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
    // Fetch all data before deleting (for undo support)
    const { data: companyData } = await supabaseAdmin
      .from("companies")
      .select("*")
      .eq("companyname", companyname)
      .single();

    const { data: contactsData } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("companyname", companyname);

    const { data: lettersData } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select("*")
      .eq("companyname", companyname);

    // Delete contacts first (FK-safe)
    await supabaseAdmin.from("contacts").delete().eq("companyname", companyname);

    // Delete any letters/drafts
    await supabaseAdmin
      .from("reachout_company_inserts")
      .delete()
      .eq("companyname", companyname);

    // Delete tracking entries
    await supabaseAdmin.from("tracking").delete().eq("companyname", companyname);

    // Delete the company
    const { error } = await supabaseAdmin
      .from("companies")
      .delete()
      .eq("companyname", companyname);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
