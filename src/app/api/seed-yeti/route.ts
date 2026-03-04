import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // First, check by company_key (likely the primary key)
  const { data: byKey } = await supabaseAdmin
    .from("companies")
    .select("companyname, company_key, niche")
    .eq("company_key", "yeticycles");

  // Also check by name
  const { data: byName } = await supabaseAdmin
    .from("companies")
    .select("companyname, company_key, niche")
    .ilike("companyname", "%yeti%");

  if ((byKey && byKey.length > 0) || (byName && byName.length > 0)) {
    return NextResponse.json({
      message: "Yeti Cycles already exists",
      byKey,
      byName,
    });
  }

  // Use upsert to handle any key conflicts
  const { data, error } = await supabaseAdmin.from("companies").upsert(
    {
      companyname: "Yeti Cycles",
      tier: 1,
      city: "Golden",
      company_key: "yeticycles",
      company_about:
        "High-performance mountain bikes known for innovative suspension technology",
      niche: "Outdoor Recreation & Equipment",
    },
    { onConflict: "company_key" }
  ).select();

  if (error) {
    // If upsert also fails, try without company_key to let DB auto-generate
    const { data: data2, error: error2 } = await supabaseAdmin
      .from("companies")
      .insert({
        companyname: "Yeti Cycles",
        tier: 1,
        city: "Golden",
        company_about:
          "High-performance mountain bikes known for innovative suspension technology",
        niche: "Outdoor Recreation & Equipment",
      })
      .select();

    if (error2) {
      return NextResponse.json(
        { error: error.message, fallbackError: error2.message },
        { status: 500 }
      );
    }

    // Add contact
    await supabaseAdmin.from("contacts").upsert(
      {
        companyname: "Yeti Cycles",
        contactname: "Chris Conroy",
        title: "President",
        email: null,
      },
      { onConflict: "companyname,contactname" }
    );

    return NextResponse.json({ message: "Yeti Cycles inserted (fallback)", data: data2 });
  }

  // Add contact
  await supabaseAdmin.from("contacts").upsert(
    {
      companyname: "Yeti Cycles",
      contactname: "Chris Conroy",
      title: "President",
      email: null,
    },
    { onConflict: "companyname,contactname" }
  );

  return NextResponse.json({ message: "Yeti Cycles inserted", data });
}
