import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  try {
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

    const all = data || [];
    const withEmail = all.filter((r) => r.contact_email && r.contact_email.trim() !== "");
    const needsEmail = all.filter((r) => !r.contact_email || r.contact_email.trim() === "");

    // Compute counts for dashboard
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    let readyCount = 0;
    let pendingCount = 0;

    for (const r of all) {
      if (r.followup2_at) continue; // done
      if (r.emailed_at) {
        // Waiting for 2nd follow-up
        if (now - new Date(r.emailed_at).getTime() >= sevenDays) readyCount++;
        else pendingCount++;
      } else {
        // Waiting for 1st follow-up
        if (now - new Date(r.sent_at).getTime() >= sevenDays) readyCount++;
        else pendingCount++;
      }
    }

    return NextResponse.json({
      all: withEmail,
      needsEmail,
      // Backward-compat for dashboard
      ready: withEmail.filter((r) => {
        if (r.followup2_at) return false;
        if (r.emailed_at) return now - new Date(r.emailed_at).getTime() >= sevenDays;
        return now - new Date(r.sent_at).getTime() >= sevenDays;
      }),
      upcoming: withEmail.filter((r) => {
        if (r.followup2_at) return false;
        if (r.emailed_at) return now - new Date(r.emailed_at).getTime() < sevenDays;
        return now - new Date(r.sent_at).getTime() < sevenDays;
      }),
      counts: { ready: readyCount, pending: pendingCount, total: all.length, needsEmail: needsEmail.length },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
