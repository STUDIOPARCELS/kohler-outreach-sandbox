import { requireCronSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

const RR_API_KEY = process.env.ROCKETREACH_API_KEY!;
const RR_BASE = "https://api.rocketreach.co";
const BATCH_SIZE = 20;
const DELAY_MS = 2000;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function searchAndSave(companyname: string): Promise<{
  saved: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${RR_BASE}/v2/api/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": RR_API_KEY,
      },
      body: JSON.stringify({
        query: {
          current_employer: [companyname],
          current_title: [
            "Mechanical Engineering Manager",
            "Engineering Manager",
            "Director of Engineering",
            "VP of Engineering",
            "VP Engineering",
            "Vice President of Engineering",
            "Head of Engineering",
            "Chief Engineer",
            "MEP Manager",
            "HVAC Engineering Manager",
            "Mechanical Department Manager",
            "Mechanical Principal",
            "Principal Mechanical Engineer",
            "Licensed Mechanical Engineer",
            "Professional Engineer",
            "Mechanical PE",
            "Senior Mechanical Engineer",
            "R&D Manager",
            "Plant Manager",
            "Product Development Manager",
            "Manufacturing Manager",
            "Design Engineering Manager",
          ],
          location: ["Colorado"],
        },
        start: 1,
        page_size: 3,
        order_by: "popularity",
      }),
    });

    if (res.status === 429) return { saved: 0, error: "rate_limited" };
    if (!res.ok) return { saved: 0, error: `http_${res.status}` };

    const data = await res.json();
    if (data.code === "throttled") return { saved: 0, error: "rate_limited" };

    let profiles = data.profiles || [];
    
    // Retry without location if Colorado returns nothing
    if (profiles.length === 0) {
      const retryRes = await fetch(`${RR_BASE}/v2/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Api-Key": RR_API_KEY },
        body: JSON.stringify({
          query: {
            current_employer: [companyname],
            current_title: [
            "Mechanical Engineering Manager",
            "Engineering Manager",
            "Director of Engineering",
            "VP of Engineering",
            "VP Engineering",
            "Vice President of Engineering",
            "Head of Engineering",
            "Chief Engineer",
            "MEP Manager",
            "HVAC Engineering Manager",
            "Mechanical Department Manager",
            "Mechanical Principal",
            "Principal Mechanical Engineer",
            "Licensed Mechanical Engineer",
            "Professional Engineer",
            "Mechanical PE",
            "Senior Mechanical Engineer",
            "R&D Manager",
            "Plant Manager",
            "Product Development Manager",
            "Manufacturing Manager",
            "Design Engineering Manager",
            ],
          },
          start: 1,
          page_size: 3,
          order_by: "popularity",
        }),
      });
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        profiles = retryData.profiles || [];
      }
    }

    if (profiles.length === 0) {
      // Mark company as searched even if nothing found — insert a placeholder
      // so the cron doesn't keep retrying it
      const { data: existing } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("companyname", companyname)
        .limit(1);
      if (!existing || existing.length === 0) {
        await supabaseAdmin.from("contacts").insert({
          companyname,
          contactname: "(no results)",
          title: "",
          email: "",
          notes: `RocketReach searched ${new Date().toISOString().split("T")[0]} - no CO results`,
        });
      }
      return { saved: 0 };
    }

    let savedCount = 0;
    let firstContact: {
      name: string;
      title: string;
      email: string;
    } | null = null;

    for (const p of profiles) {
      const name =
        p.name ||
        [p.first_name, p.last_name].filter(Boolean).join(" ") ||
        "";
      if (!name) continue;
      const teaser = p.teaser || {};

      const row = {
        companyname,
        contactname: name,
        title: p.current_title || "",
        email: ((teaser.emails?.[0] ?? "") as string).includes("@") ? (teaser.emails?.[0] as string) : "",
        linkedin: p.linkedin_url || "",
        phone: (teaser.phones?.[0] ?? "") as string,
        notes: `RocketReach ${new Date().toISOString().split("T")[0]}`,
      };

      // If no real email from teaser, do person lookup
      if (!row.email) {
        try {
          const lookupRes = await fetch(
            `${RR_BASE}/v2/api/person/lookup?name=${encodeURIComponent(name)}&current_employer=${encodeURIComponent(companyname)}`,
            { headers: { "Api-Key": RR_API_KEY } }
          );
          if (lookupRes.ok) {
            const ld = await lookupRes.json();
            row.email = ld.current_work_email
              || ld.current_personal_email
              || (ld.emails?.find((e: { email: string }) => e.email?.includes("@"))?.email)
              || "";
          }
          await new Promise(r => setTimeout(r, 1000));
        } catch { /* continue */ }
      }

      const { data: existing } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("companyname", companyname)
        .ilike("contactname", name)
        .limit(1);

      if (!existing || existing.length === 0) {
        const { error } = await supabaseAdmin.from("contacts").insert(row);
        if (!error) {
          savedCount++;
          if (!firstContact)
            firstContact = {
              name: row.contactname,
              title: row.title,
              email: row.email,
            };
        }
      }
    }

    // Auto-create draft letter with best contact
    if (firstContact) {
      const { data: existingLetter } = await supabaseAdmin
        .from("reachout_company_inserts")
        .select("id")
        .eq("companyname", companyname)
        .limit(1);

      if (!existingLetter || existingLetter.length === 0) {
        await supabaseAdmin.from("reachout_company_inserts").insert({
          companyname,
          contactname: firstContact.name,
          contact_title: firstContact.title,
          contact_email: firstContact.email,
          status: "draft",
        });
      }
    }

    return { saved: savedCount };
  } catch (e: unknown) {
    return { saved: 0, error: (e as Error).message };
  }
}

export async function GET(req: NextRequest) {
  const authError = requireCronSecret(req); if (authError) return authError;

  // Get companies that have NO contacts yet
  const { data: allCompanies } = await supabaseAdmin
    .from("companies")
    .select("companyname")
    .order("companyname");

  const { data: companiesWithContacts } = await supabaseAdmin
    .from("contacts")
    .select("companyname");

  if (!allCompanies) {
    return NextResponse.json({ error: "Failed to load companies" });
  }

  const hasContact = new Set(
    (companiesWithContacts || []).map((c: { companyname: string }) =>
      c.companyname.toLowerCase().trim()
    )
  );

  const needsContacts = allCompanies.filter(
    (c: { companyname: string }) =>
      !hasContact.has(c.companyname.toLowerCase().trim())
  );

  if (needsContacts.length === 0) {
    return NextResponse.json({
      message: "All companies have contacts. Cron complete.",
      remaining: 0,
    });
  }

  // Process batch
  const batch = needsContacts.slice(0, BATCH_SIZE);
  const results: { company: string; saved: number; error?: string }[] = [];
  let rateLimited = false;

  for (const c of batch) {
    if (rateLimited) break;

    const result = await searchAndSave(c.companyname);
    results.push({ company: c.companyname, ...result });

    if (result.error === "rate_limited") {
      rateLimited = true;
      break;
    }

    await delay(DELAY_MS);
  }

  const totalSaved = results.reduce((sum, r) => sum + r.saved, 0);
  const remaining = needsContacts.length - results.length;

  // Log to console for Vercel logs
  console.log(
    `[CRON] Processed ${results.length}/${needsContacts.length} companies. Saved ${totalSaved} contacts. Rate limited: ${rateLimited}. Remaining: ${remaining}`
  );

  return NextResponse.json({
    processed: results.length,
    contacts_saved: totalSaved,
    remaining,
    rate_limited: rateLimited,
    results,
  });
}

// Allow POST too for manual triggers
export const POST = GET;

export const maxDuration = 60;
