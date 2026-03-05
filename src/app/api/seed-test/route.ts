import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function POST() {
  // Insert or update test company
  const { data: existing } = await supabaseAdmin
    .from("companies")
    .select("companyname")
    .eq("companyname", "TEST COMPANY")
    .limit(1);

  if (existing && existing.length > 0) {
    await supabaseAdmin.from("companies")
      .update({ niche: "TEST", tier: 1, city: "Boise", mailing_address1: "1020 E Warm Springs Ave", mailing_city: "Boise", mailing_state: "ID", mailing_zip: "83712" })
      .eq("companyname", "TEST COMPANY");
  } else {
    await supabaseAdmin.from("companies").insert({
      companyname: "TEST COMPANY",
      tier: 1,
      city: "Boise",
      niche: "TEST",
      mailing_address1: "1020 E Warm Springs Ave",
      mailing_city: "Boise",
      mailing_state: "ID",
      mailing_zip: "83712",
      company_about: "Test company for email workflow validation",
    });
  }

  // Insert test contacts
  const testContacts = [
    { companyname: "TEST COMPANY", contactname: "Lisa Wood", title: "", email: "317lrw@gmail.com" },
    { companyname: "TEST COMPANY", contactname: "Hallie Stapleton", title: "", email: "hallie.stapleton@nxtthingrpo.com" },
    { companyname: "TEST COMPANY", contactname: "Kohler Wood", title: "", email: "kwood12802@gmail.com" },
  ];
  for (const c of testContacts) {
    const { data: exists } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("companyname", c.companyname)
      .eq("contactname", c.contactname)
      .limit(1);
    if (exists && exists.length > 0) {
      await supabaseAdmin.from("contacts").update({ email: c.email, title: c.title }).eq("id", exists[0].id);
    } else {
      await supabaseAdmin.from("contacts").insert(c);
    }
  }

  // Insert draft letter
  const { data: existingLetter } = await supabaseAdmin
    .from("reachout_company_inserts")
    .select("id")
    .eq("companyname", "TEST COMPANY")
    .limit(1);

  if (!existingLetter || existingLetter.length === 0) {
    await supabaseAdmin.from("reachout_company_inserts").insert({
      companyname: "TEST COMPANY",
      contactname: "Lisa Wood",
      contact_title: "Creative Director",
      contact_email: "317lrw@gmail.com",
      status: "draft",
    });
  }

  return NextResponse.json({ success: true, message: "TEST COMPANY test company seeded" });
}
