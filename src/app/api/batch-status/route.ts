import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { ids, status } = await req.json();
  if (!ids || !Array.isArray(ids) || !status)
    return NextResponse.json(
      { error: "ids (array) and status (string) required" },
      { status: 400 }
    );

  const { data, error } = await supabaseAdmin
    .from("reachout_company_inserts")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", ids)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
