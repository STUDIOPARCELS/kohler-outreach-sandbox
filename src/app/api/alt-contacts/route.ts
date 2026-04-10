import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { requireAppOrigin } = await import("@/lib/auth");
  const authError = requireAppOrigin(req); if (authError) return authError;
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  
  const company = req.nextUrl.searchParams.get("company");
  const exclude = req.nextUrl.searchParams.get("exclude");
  if (!company) return NextResponse.json({ contacts: [] });

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("contactname, title, email")
    .eq("companyname", company)
    .not("email", "is", null)
    .neq("email", "")
    .order("contactname");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const filtered = (data || []).filter(c => c.contactname !== exclude);
  return NextResponse.json({ contacts: filtered });
}
