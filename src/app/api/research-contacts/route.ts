import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

const RR_API_KEY = process.env.ROCKETREACH_API_KEY!;
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

    let searchData: Record<string, unknown> = {};
    if (!searchRes.ok) {
      // RocketReach HTTP error — skip to web search fallback
      searchData = { code: "http_error", profiles: [] };
    } else {
      searchData = await searchRes.json();
    }
    
    const profiles = (searchData.code === "throttled" || searchData.code === "http_error") ? [] : ((searchData.profiles || []) as Record<string, unknown>[]);
    
    // If no results with Colorado filter, retry without location (skip if throttled)
    let finalProfiles = profiles;
    if (finalProfiles.length === 0 && searchData.code !== "throttled") {
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
      // ── FALLBACK: OpenAI web search for contacts via LinkedIn / company website ──
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        try {
          const aiRes = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              tools: [{ type: "web_search_preview" }],
              input: `Search LinkedIn and the company website for people who work at "${companyname}" in Colorado or nearby.

I need engineering leadership contacts: Engineering Manager, Director of Engineering, VP Engineering, Chief Engineer, Owner, Founder, President, Plant Manager, Manufacturing Manager.

Search: "${companyname} engineering manager site:linkedin.com" and "${companyname} director engineering site:linkedin.com" and "${companyname} team" or "${companyname} about us".

Return ONLY a JSON array (no markdown, no backticks):
[{"name":"First Last","title":"their job title"}]

If you find the owner or founder, include them. Include up to 3 people max. Only include people you are confident currently work there.
If you truly cannot find anyone, return [].
ONLY the JSON array.`,
              text: { format: { type: "text" } },
            }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            let aiText = "";
            if (aiData.output) {
              for (const item of aiData.output) {
                if (item.type === "message" && item.content) {
                  for (const c of item.content) {
                    if (c.type === "output_text") aiText += c.text;
                  }
                }
              }
            }

            try {
              const cleaned = aiText.replace(/```json\n?|\n?```/g, "").trim();
              const aiContacts = JSON.parse(cleaned);
              if (Array.isArray(aiContacts) && aiContacts.length > 0) {
                const aiSaved = [];
                for (const ac of aiContacts.slice(0, 3)) {
                  const name = (String((ac as Record<string, unknown>).name || "")).trim();
                  const title = (String((ac as Record<string, unknown>).title || "")).trim();
                  if (!name || name.split(/\s+/).length < 2) continue;
                  // Reject placeholder/fake names
                  if (/^(First|Last|John|Jane|Test|Example)\s+(Last|Doe|Name|User|Person)$/i.test(name)) continue;

                  const { data: existing } = await supabaseAdmin
                    .from("contacts")
                    .select("id")
                    .eq("companyname", companyname)
                    .ilike("contactname", name)
                    .limit(1);

                  if (!existing || existing.length === 0) {
                    const contactRow = {
                      companyname,
                      contactname: name,
                      title,
                      email: "",
                      linkedin: "",
                      notes: `Web search ${new Date().toISOString().split("T")[0]}`,
                    };
                    const { error } = await supabaseAdmin.from("contacts").insert(contactRow);
                    if (!error) aiSaved.push(contactRow);
                  }
                }

                if (aiSaved.length > 0) {
                  // Create a draft letter for the first contact
                  const { data: existingLetter } = await supabaseAdmin
                    .from("reachout_company_inserts")
                    .select("id")
                    .eq("companyname", companyname)
                    .limit(1);

                  if (!existingLetter || existingLetter.length === 0) {
                    await supabaseAdmin.from("reachout_company_inserts").insert({
                      companyname,
                      contactname: aiSaved[0].contactname,
                      contact_title: aiSaved[0].title,
                      contact_email: "",
                      status: "draft",
                    });
                  }

                  return NextResponse.json({
                    contacts: aiSaved,
                    message: `No RocketReach results. Found ${aiSaved.length} contacts via web search.`,
                    source: "web_search",
                  });
                }
              }
            } catch { /* JSON parse failed */ }
          }
        } catch { /* OpenAI fallback failed */ }
      }

      return NextResponse.json({ contacts: [], message: "No results found on RocketReach or web search for this company." });
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
      const name = String(p.name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "");
      if (!name) continue;
      // STRICT: reject abbreviated or incomplete names
      const nameParts = name.trim().split(/\s+/);
      if (nameParts.length < 2) continue; // must have first + last
      const lastName = nameParts[nameParts.length - 1];
      if (lastName.length <= 2 || /^[A-Z]\.?$/.test(lastName)) continue; // reject "B.", "M.", single initials

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
