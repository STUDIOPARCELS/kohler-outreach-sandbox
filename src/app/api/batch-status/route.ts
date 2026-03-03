import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { ids, status } = await req.json();
  if (!ids || !Array.isArray(ids) || !status)
    return NextResponse.json(
      { error: "ids (array) and status (string) required" },
      { status: 400 }
    );

  const now = new Date().toISOString();
  const updatePayload: Record<string, string> = { status, updated_at: now };
  if (status === "printed") updatePayload.printed_at = now;
  if (status === "sent") updatePayload.sent_at = now;

  const { data, error } = await supabaseAdmin
    .from("reachout_company_inserts")
    .update(updatePayload)
    .in("id", ids)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
