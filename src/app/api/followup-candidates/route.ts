import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  try {
    // Fetch ALL letters that have been physically sent
    const { data, error } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select(
        "id, companyname, contactname, contact_title, contact_email, body_final, subject_final, status, printed_at, sent_at, emailed_at, followup2_at, created_at"
      )
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const all = (data || []).filter(
      (r) => r.contact_email && r.contact_email.trim() !== ""
    );

    const letterOnly = (data || []).filter(
      (r) => !r.contact_email || r.contact_email.trim() === ""
    );

    return NextResponse.json({ all, letterOnly });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
