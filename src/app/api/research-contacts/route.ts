import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

const RR_API_KEY = "ac2b96kfab306c1fce8fda977e8fc6262f0f17a";
const RR_BASE = "https://api.rocketreach.co";

export async function POST(req: NextRequest) {
  const { companyname } = await req.json();
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  try {
    const searchRes = await fetch(`${RR_BASE}/v2/api/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": RR_API_KEY,
      },
      body: JSON.stringify({
        query: {
          current_employer: [companyname],
          current_title: [
            "Engineering Manager",
            "Director of Engineering",
            "VP Engineering",
            "VP of Engineering",
            "Chief Engineer",
            "Principal Engineer",
            "Lead Engineer",
            "Senior Engineer",
            "Mechanical Engineer",
            "Design Engineer",
            "Manufacturing Engineer",
            "Project Engineer",
            "Plant Manager",
            "Operations Manager",
            "General Manager",
            "-Recruiter", "-HR", "-Human Resources",
            "-Talent Acquisition", "-Staffing",
            "-Sales", "-Marketing", "-Account Executive",
          ],
          location: ["Colorado"],
        },
        start: 1,
        page_size: 5,
        order_by: "popularity",
      }),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      return NextResponse.json(
        { error: `RocketReach error ${searchRes.status}: ${errText.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const searchData = await searchRes.json();
    if (searchData.code === "throttled") {
      return NextResponse.json(
        { error: "RocketReach rate limit hit. Try again in ~40 minutes." },
        { status: 429 }
      );
    }

    const profiles = searchData.profiles || [];
    if (profiles.length === 0) {
      return NextResponse.json({ contacts: [], message: "No results on RocketReach for this company in Colorado." });
    }

    const saved = [];
    for (const p of profiles) {
      const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "";
      if (!name) continue;
      const teaser = p.teaser || {};

      // Try teaser email first
      let email = ((teaser.emails?.[0] ?? "") as string).includes("@") ? (teaser.emails?.[0] as string) : "";

      // If no real email from teaser, do a person lookup to get work email
      if (!email) {
        try {
          const lookupRes = await fetch(
            `${RR_BASE}/v2/api/person/lookup?name=${encodeURIComponent(name)}&current_employer=${encodeURIComponent(companyname)}`,
            { headers: { "Api-Key": RR_API_KEY } }
          );
          if (lookupRes.ok) {
            const lookupData = await lookupRes.json();
            email = lookupData.current_work_email
              || lookupData.current_personal_email
              || (lookupData.emails?.find((e: { email: string }) => e.email?.includes("@"))?.email)
              || "";
          }
          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 1000));
        } catch { /* person lookup failed, continue without email */ }
      }

      const contactRow = {
        companyname,
        contactname: name,
        title: p.current_title || "",
        email,
        linkedin: p.linkedin_url || "",
        phone: (teaser.phones?.[0] ?? "") as string,
        notes: `RocketReach ${new Date().toISOString().split("T")[0]}`,
      };

      const { data: existing } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("companyname", companyname)
        .ilike("contactname", name)
        .limit(1);

      if (!existing || existing.length === 0) {
        const { error } = await supabaseAdmin.from("contacts").insert(contactRow);
        if (!error) saved.push(contactRow);
      } else {
        saved.push(contactRow);
      }
    }

    if (saved.length > 0) {
      const { data: existingLetter } = await supabaseAdmin
        .from("reachout_company_inserts")
        .select("id")
        .eq("companyname", companyname)
        .limit(1);

      if (!existingLetter || existingLetter.length === 0) {
        await supabaseAdmin.from("reachout_company_inserts").insert({
          companyname,
          contactname: saved[0].contactname,
          contact_title: saved[0].title,
          contact_email: saved[0].email,
          status: "draft",
        });
      }
    }

    return NextResponse.json({
      contacts: saved,
      message: `Found ${profiles.length} people, saved ${saved.length} contacts.`,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
