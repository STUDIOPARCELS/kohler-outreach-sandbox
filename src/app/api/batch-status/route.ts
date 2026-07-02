import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const { ids, status } = await req.json();
  if (!ids || !Array.isArray(ids) || !status)
    return NextResponse.json(
      { error: "ids (array) and status (string) required" },
      { status: 400 }
    );

  const now = new Date().toISOString();
  const updatePayload: Record<string, string | null> = { status, updated_at: now };
  if (status === "printed" || status === "sent") {
    updatePayload.printed_at = now;
    updatePayload.sent_at = now;
  }
  if (status === "draft") {
    // Explicit reset back to draft clears the lifecycle timestamps — otherwise
    // the row keeps its old sent_at and haunts /followups as a phantom letter.
    updatePayload.printed_at = null;
    updatePayload.sent_at = null;
    updatePayload.emailed_at = null;
    updatePayload.followup2_at = null;
  }

  const { data, error } = await supabaseAdmin
    .from("reachout_company_inserts")
    .update(updatePayload)
    .in("id", ids)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
