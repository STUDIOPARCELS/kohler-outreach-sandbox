import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Check if Yeti Cycles already exists
  const { data: existing } = await supabaseAdmin
    .from("companies")
    .select("companyname")
    .ilike("companyname", "%yeti%");

  if (existing && existing.length > 0) {
    return NextResponse.json({ message: "Yeti Cycles already exists", existing });
  }

  // Insert Yeti Cycles
  const { data, error } = await supabaseAdmin.from("companies").insert({
    companyname: "Yeti Cycles",
    tier: 1,
    city: "Golden",
    company_key: "yeticycles",
    company_about: "High-performance mountain bikes known for innovative suspension technology",
    niche: "Outdoor Recreation & Equipment",
  }).select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also add a contact if we know one
  await supabaseAdmin.from("contacts").insert({
    companyname: "Yeti Cycles",
    contactname: "Chris Conroy",
    title: "President",
    email: null,
  });

  return NextResponse.json({ message: "Yeti Cycles inserted", data });
}
