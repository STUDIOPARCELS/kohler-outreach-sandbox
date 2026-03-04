import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

const RR_API_KEY = "ac2b96kfab306c1fce8fda977e8fc6262f0f17a";
const RR_BASE = "https://api.rocketreach.co/api/v2";

/* Titles we care about for a mechanical engineering cold letter */
const TARGET_TITLES = [
  "engineering manager",
  "director of engineering",
  "vp engineering",
  "vp of engineering",
  "chief technology officer",
  "cto",
  "president",
  "owner",
  "founder",
  "ceo",
  "chief executive officer",
  "general manager",
  "operations manager",
  "director of operations",
  "hiring manager",
  "hr manager",
  "human resources",
  "talent acquisition",
  "mechanical engineer",
  "senior mechanical engineer",
  "principal engineer",
  "lead engineer",
  "chief engineer",
  "plant manager",
  "facility manager",
  "shop manager",
  "production manager",
  "manufacturing manager",
  "design engineer",
  "project manager",
  "project engineer",
];

export async function POST(req: NextRequest) {
  const { companyname } = await req.json();
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  try {
    // Step 1: Search RocketReach for people at this company
    const searchRes = await fetch(`${RR_BASE}/searchPeople`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": RR_API_KEY,
      },
      body: JSON.stringify({
        query: {
          current_employer: [companyname],
          location: ["Colorado"],
        },
        start: 1,
        page_size: 10,
      }),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error("RocketReach search error:", searchRes.status, errText);
      return NextResponse.json(
        { error: `RocketReach API error: ${searchRes.status}` },
        { status: 500 }
      );
    }

    const searchData = await searchRes.json();
    const profiles = searchData.profiles || [];

    if (profiles.length === 0) {
      return NextResponse.json({ contacts: [], message: "No results found on RocketReach for this company in Colorado." });
    }

    // Step 2: Score and sort by title relevance
    const scored = profiles.map((p: Record<string, unknown>) => {
      const title = ((p.current_title as string) || "").toLowerCase();
      const titleIdx = TARGET_TITLES.findIndex((t) => title.includes(t));
      const score = titleIdx >= 0 ? TARGET_TITLES.length - titleIdx : -1;
      return { ...p, _score: score };
    });

    scored.sort(
      (a: { _score: number }, b: { _score: number }) => b._score - a._score
    );

    // Take top 5
    const top = scored.slice(0, 5);

    // Step 3: Save to contacts table
    const saved = [];
    for (const p of top) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || (p.name as string) || "";
      if (!name) continue;

      const contactRow = {
        companyname: companyname,
        contactname: name,
        title: (p.current_title as string) || "",
        email: (p.teaser?.emails?.[0] ?? p.email ?? "") as string,
        linkedin: (p.linkedin_url as string) || "",
        phone: (p.teaser?.phones?.[0] ?? "") as string,
        notes: `RocketReach ${new Date().toISOString().split("T")[0]}`,
      };

      // Upsert: skip if contact already exists for this company
      const { data: existing } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("companyname", companyname)
        .ilike("contactname", name)
        .limit(1);

      if (!existing || existing.length === 0) {
        const { error } = await supabaseAdmin
          .from("contacts")
          .insert(contactRow);
        if (!error) saved.push(contactRow);
      } else {
        saved.push(contactRow);
      }
    }

    // Step 4: Auto-create a draft letter if we saved at least one contact
    if (saved.length > 0) {
      // Check if there's already a letter
      const { data: existingLetter } = await supabaseAdmin
        .from("reachout_company_inserts")
        .select("id")
        .eq("companyname", companyname)
        .limit(1);

      if (!existingLetter || existingLetter.length === 0) {
        // Get the company niche to pick the right paragraph
        const { data: companyData } = await supabaseAdmin
          .from("companies")
          .select("niche")
          .eq("companyname", companyname)
          .limit(1);

        const niche = companyData?.[0]?.niche || "";

        // Fire the trigger by doing an update (the trigger creates the letter)
        // Or just insert directly
        await supabaseAdmin
          .from("reachout_company_inserts")
          .insert({
            companyname: companyname,
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
    console.error("Research contacts error:", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
