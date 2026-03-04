import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const kohlerUrl = process.env.KOHLER_SUPABASE_URL;
  const standardUrl = process.env.SUPABASE_URL;
  const activeUrl = kohlerUrl || standardUrl || "NOT SET";

  const urlMatch = activeUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = urlMatch
    ? urlMatch[1]
    : "UNKNOWN_FORMAT: " + activeUrl.substring(0, 30);

  const { count, error } = await supabaseAdmin
    .from("companies")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    activeProjectRef: projectRef,
    expectedProjectRef: "acwgirrldntjpzrhqmdh",
    match: projectRef === "acwgirrldntjpzrhqmdh",
    companyCount: count,
    usingKohlerEnvVar: !!kohlerUrl,
    usingStandardEnvVar: !kohlerUrl && !!standardUrl,
    error: error?.message || null,
    timestamp: new Date().toISOString(),
  });
}
