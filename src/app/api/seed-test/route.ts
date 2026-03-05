import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function POST() {
  // Insert test company
  await supabaseAdmin.from("companies").upsert({
    companyname: "LISA WOOD STUDIO",
    tier: 1,
    city: "Boise",
    niche: "TEST",
    mailing_address1: "1020 E Warm Springs Ave",
    mailing_city: "Boise",
    mailing_state: "ID",
    mailing_zip: "83712",
    company_about: "Test company for email workflow validation",
  }, { onConflict: "companyname" });

  // Insert test contact
  await supabaseAdmin.from("contacts").upsert({
    companyname: "LISA WOOD STUDIO",
    contactname: "Lisa Wood",
    title: "Creative Director",
    email: "317lrw@gmail.com",
  }, { onConflict: "companyname,contactname" });

  // Insert draft letter
  const { data: existing } = await supabaseAdmin
    .from("reachout_company_inserts")
    .select("id")
    .eq("companyname", "LISA WOOD STUDIO")
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabaseAdmin.from("reachout_company_inserts").insert({
      companyname: "LISA WOOD STUDIO",
      contactname: "Lisa Wood",
      contact_title: "Creative Director",
      contact_email: "317lrw@gmail.com",
      status: "draft",
    });
  }

  return NextResponse.json({ success: true, message: "LISA WOOD STUDIO test company seeded" });
}
