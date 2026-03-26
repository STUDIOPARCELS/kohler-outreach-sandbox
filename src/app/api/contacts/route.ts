import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

const PREFERRED_TITLES = [
  "director of engineering",
  "engineering manager",
  "vp engineering",
  "vp of engineering",
  "cto",
  "founder",
  "president",
];

function contactScore(c: { email?: string | null; title?: string | null }): number {
  let score = 0;
  if (c.email && c.email.trim() !== "") score += 10;
  const t = (c.title || "").toLowerCase();
  if (PREFERRED_TITLES.some((p) => t.includes(p))) score += 5;
  return score;
}

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const companyname = req.nextUrl.searchParams.get("companyname");
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("companyname", companyname);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sorted = (data || []).sort((a, b) => contactScore(b) - contactScore(a));
  return NextResponse.json(sorted);
}
