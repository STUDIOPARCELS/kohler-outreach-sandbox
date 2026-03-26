import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  try {
    // Find letters that were sent (physical mail) 7+ days ago,
    // have an email address, and haven't been followed up via email yet
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select(
        "id, companyname, contactname, contact_title, contact_email, body_final, subject_final, status, printed_at, sent_at, emailed_at, created_at"
      )
      .not("contact_email", "is", null)
      .not("sent_at", "is", null)
      .is("emailed_at", null)
      .lt("sent_at", sevenDaysAgo)
      .order("sent_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also include letters sent more recently (for preview/upcoming)
    const { data: upcoming, error: upErr } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select(
        "id, companyname, contactname, contact_title, contact_email, status, sent_at, emailed_at"
      )
      .not("contact_email", "is", null)
      .not("sent_at", "is", null)
      .is("emailed_at", null)
      .gte("sent_at", sevenDaysAgo)
      .order("sent_at", { ascending: true });

    return NextResponse.json({
      ready: data || [],
      upcoming: upcoming || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
