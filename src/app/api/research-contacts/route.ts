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
            "VP of Engineering",
            "VP Engineering",
            "Vice President of Engineering",
            "Head of Engineering",
            "Chief Engineer",
            "R&D Manager",
            "Plant Manager",
            "Product Development Manager",
            "Manufacturing Manager",
            "Design Engineering Manager",
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
    
    // If no results with Colorado filter, retry without location
    let finalProfiles = profiles;
    if (finalProfiles.length === 0) {
      const retryRes = await fetch(`${RR_BASE}/v2/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Api-Key": RR_API_KEY },
        body: JSON.stringify({
          query: {
            current_employer: [companyname],
            current_title: [
                              "Engineering Manager",
            "Director of Engineering",
            "VP of Engineering",
            "VP Engineering",
            "Vice President of Engineering",
            "Head of Engineering",
            "Chief Engineer",
            "R&D Manager",
            "Plant Manager",
            "Product Development Manager",
            "Manufacturing Manager",
            "Design Engineering Manager",
            ],
          },
          start: 1,
          page_size: 5,
          order_by: "popularity",
        }),
      });
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        finalProfiles = retryData.profiles || [];
      }
    }

    if (finalProfiles.length === 0) {
      return NextResponse.json({ contacts: [], message: "No results on RocketReach for this company." });
    }

    const saved = [];
    // Management title patterns — ONLY these get through
    const mgmtPatterns = [
      /manager/i, /director/i, /vp\b/i, /vice president/i, /president/i,
      /ceo/i, /cto/i, /coo/i, /chief/i, /head of/i, /founder/i, /owner/i,
      /principal/i, /partner/i, /svp/i, /evp/i, /general manager/i,
      /plant manager/i, /superintendent/i, /supervisor/i, /pres$/i,
      /lead\b/i, /senior\s+director/i, /executive/i,
    ];
    // Reject non-engineering management (HR, sales, IT, recruiting, marketing)
    const rejectPatterns = [
      /talent/i, /people\s*operations/i, /human\s*resources/i, /\bhr\b/i,
      /sales/i, /marketing/i, /recruiting/i, /acquisition/i,
      /information\s*technology/i, /\bit\s/i, /data\s*operations/i,
      /proposal\s*manager/i, /account\s*manager/i, /communications/i,
      /legal/i, /counsel/i, /finance\s*manager/i, /comptroller/i,
    ];

    for (const p of finalProfiles) {
      const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "";
      if (!name) continue;

      const title = p.current_title || "";
      // STRICT: reject contacts with no title — unknown role
      if (!title) continue;
      // STRICT: reject individual contributors — title must match a management pattern
      if (!mgmtPatterns.some(pat => pat.test(title))) continue;
      // Reject non-engineering management (HR, sales, etc)
      if (rejectPatterns.some(pat => pat.test(title))) continue;

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
        email_searched: true,
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
