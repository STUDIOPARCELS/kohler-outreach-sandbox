import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest) {
  const { companyname } = await req.json();

  if (!companyname) {
    return NextResponse.json({ error: "companyname required" }, { status: 400 });
  }

  try {
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

    return NextResponse.json({ success: true, deleted: companyname });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
