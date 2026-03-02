import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const ids = req.nextUrl.searchParams.get("ids");

  let query = supabaseAdmin
    .from("reachout_company_inserts")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (ids) {
    const idList = ids.split(",").filter(Boolean);
    query = query.in("id", idList);
  }

  const { data: inserts, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch final letters to merge
  const { data: finals } = await supabaseAdmin
    .from("reachout_final_letters")
    .select("*");

  const finalMap = new Map(
    (finals || []).map((f: Record<string, unknown>) => [f.companyname, f])
  );

  const merged = (inserts || []).map((row: Record<string, unknown>) => {
    const fl = finalMap.get(row.companyname) as Record<string, unknown> | undefined;
    return {
      ...row,
      subject_final: fl?.subject_final || null,
      body_final: fl?.body_final || null,
    };
  });

  return NextResponse.json(merged);
}
