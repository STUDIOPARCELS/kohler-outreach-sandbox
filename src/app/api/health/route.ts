import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;

  const { count, error } = await supabaseAdmin
    .from("companies")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    status: error ? "error" : "ok",
    companyCount: count,
    timestamp: new Date().toISOString(),
  });
}
