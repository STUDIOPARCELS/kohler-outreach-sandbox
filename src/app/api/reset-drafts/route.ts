import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function POST() {
  const { data, error } = await supabaseAdmin
    .from("reachout_company_inserts")
    .update({ status: "draft", sent_at: null, printed_at: null })
    .neq("status", "placeholder");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "All letters reset to draft" });
}
