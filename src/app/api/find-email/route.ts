import { requireAppOrigin } from "@/lib/auth";
import { mustWrite } from "@/lib/dbGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

const RR_API_KEY = process.env.ROCKETREACH_API_KEY!;
const RR_BASE = "https://api.rocketreach.co";

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const { contactId, contactname, companyname } = await req.json();

  if (!contactname || !companyname) {
    return NextResponse.json({ error: "contactname and companyname required" }, { status: 400 });
  }

  try {
    // Try person lookup by name + employer
    const lookupRes = await fetch(
      `${RR_BASE}/v2/api/person/lookup?name=${encodeURIComponent(contactname)}&current_employer=${encodeURIComponent(companyname)}`,
      { headers: { "Api-Key": RR_API_KEY } }
    );

    if (lookupRes.status === 429) {
      return NextResponse.json({ error: "RocketReach rate limit. Try again in a few minutes." }, { status: 429 });
    }

    if (!lookupRes.ok) {
      // Fallback to search
      const searchRes = await fetch(`${RR_BASE}/v2/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Api-Key": RR_API_KEY },
        body: JSON.stringify({
          query: { name: [contactname], current_employer: [companyname] },
          start: 1,
          page_size: 1,
        }),
      });

      if (!searchRes.ok) {
        return NextResponse.json({ error: "RocketReach search failed" }, { status: 500 });
      }

      const searchData = await searchRes.json();
      const profiles = searchData.profiles || [];
      if (profiles.length === 0) {
        if (contactId) mustWrite("find-email: mark contact email_searched", await supabaseAdmin.from("contacts").update({ email_searched: true }).eq("id", contactId));
        return NextResponse.json({ email: null, message: "No results found" });
      }

      const teaser = profiles[0].teaser || {};
      const email = (teaser.emails?.[0] ?? "") as string;
      if (!email.includes("@")) {
        if (contactId) mustWrite("find-email: mark contact email_searched", await supabaseAdmin.from("contacts").update({ email_searched: true }).eq("id", contactId));
        return NextResponse.json({ email: null, message: "No email found in search results" });
      }

      // Update contact
      if (contactId) {
        mustWrite("find-email: contact email update", await supabaseAdmin.from("contacts").update({ email, email_searched: true }).eq("id", contactId));
        mustWrite("find-email: letter contact_email update", await supabaseAdmin.from("reachout_company_inserts")
          .update({ contact_email: email })
          .eq("companyname", companyname)
          .ilike("contactname", contactname));
      }

      return NextResponse.json({ email, source: "search" });
    }

    const data = await lookupRes.json();
    if (data.code === "throttled") {
      return NextResponse.json({ error: "RocketReach rate limit." }, { status: 429 });
    }

    const email =
      data.current_work_email ||
      data.current_personal_email ||
      (data.emails?.find((e: { email: string }) => e.email?.includes("@"))?.email) ||
      "";

    if (!email) {
      if (contactId) mustWrite("find-email: mark contact email_searched", await supabaseAdmin.from("contacts").update({ email_searched: true }).eq("id", contactId));
      return NextResponse.json({ email: null, message: "Person found but no email available" });
    }

    // Update contact in database
    if (contactId) {
      mustWrite("find-email: contact email update", await supabaseAdmin.from("contacts").update({ email, email_searched: true }).eq("id", contactId));
      mustWrite("find-email: letter contact_email update", await supabaseAdmin.from("reachout_company_inserts")
        .update({ contact_email: email })
        .eq("companyname", companyname)
        .ilike("contactname", contactname));
    }

    return NextResponse.json({ email, source: "lookup" });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
