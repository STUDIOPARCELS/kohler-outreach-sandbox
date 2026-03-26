import { requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const companyname = req.nextUrl.searchParams.get("companyname");
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("*")
    .eq("companyname", companyname)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const body = await req.json();
  const { companyname, ...fields } = body;
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("companies")
    .update(fields)
    .eq("companyname", companyname)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
