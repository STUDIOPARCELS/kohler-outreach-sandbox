import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

const RR_API_KEY = process.env.ROCKETREACH_API_KEY!;
const RR_BASE = "https://api.rocketreach.co";

async function searchCompany(companyname: string): Promise<{ saved: number; error?: string }> {
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
            "VP Engineering", "VP of Engineering",
            "Chief Engineer", "Principal Engineer",
            "Lead Engineer", "Senior Engineer",
            "Mechanical Engineer", "Design Engineer",
            "Manufacturing Engineer", "Project Engineer",
            "Plant Manager", "Operations Manager",
            "General Manager",
            "-Recruiter", "-HR", "-Human Resources",
            "-Talent Acquisition", "-Staffing",
            "-Sales", "-Marketing", "-Account Executive",
          ],
          location: ["Colorado"],
        },
        start: 1,
        page_size: 3,
        order_by: "popularity",
      }),
    });

    if (searchRes.status === 429) {
      return { saved: 0, error: "rate_limited" };
    }

    if (!searchRes.ok) {
      return { saved: 0, error: `http_${searchRes.status}` };
    }

    const searchData = await searchRes.json();
    if (searchData.code === "throttled") {
      return { saved: 0, error: "rate_limited" };
    }

    const profiles = searchData.profiles || [];
    if (profiles.length === 0) return { saved: 0 };

    let savedCount = 0;
    let firstContact: { name: string; title: string; email: string } | null = null;

    for (const p of profiles) {
      const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "";
      if (!name) continue;
      const teaser = p.teaser || {};

      const row = {
        companyname,
        contactname: name,
        title: p.current_title || "",
        email: (teaser.emails?.[0] ?? "") as string,
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
        const { error } = await supabaseAdmin.from("contacts").insert(row);
        if (!error) {
          savedCount++;
          if (!firstContact) firstContact = { name: row.contactname, title: row.title, email: row.email };
        }
      }
    }

    // Auto-create draft letter
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

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST() {
  // Get all companies
  const { data: allCompanies } = await supabaseAdmin
    .from("companies")
    .select("companyname")
    .order("companyname");

  if (!allCompanies) {
    return NextResponse.json({ error: "Failed to load companies" }, { status: 500 });
  }

  // Find companies without contacts
  const { data: companiesWithContacts } = await supabaseAdmin
    .from("contacts")
    .select("companyname");

  const hasContact = new Set(
    (companiesWithContacts || []).map((c: { companyname: string }) => c.companyname.toLowerCase().trim())
  );

  const needsContacts = allCompanies.filter(
    (c: { companyname: string }) => !hasContact.has(c.companyname.toLowerCase().trim())
  );

  const results: { company: string; saved: number; error?: string }[] = [];
  let rateLimited = false;

  // Process up to 50 per batch with 2s delay
  const batch = needsContacts.slice(0, 50);

  for (const c of batch) {
    if (rateLimited) break;

    const result = await searchCompany(c.companyname);
    results.push({ company: c.companyname, ...result });

    if (result.error === "rate_limited") {
      rateLimited = true;
      break;
    }

    await delay(2000);
  }

  const totalSaved = results.reduce((sum, r) => sum + r.saved, 0);
  const remaining = needsContacts.length - results.length;

  return NextResponse.json({
    processed: results.length,
    contacts_saved: totalSaved,
    remaining_companies: remaining,
    rate_limited: rateLimited,
    results,
    message: rateLimited
      ? `Processed ${results.length} companies (${totalSaved} contacts) before rate limit. ${remaining} left. Run again in ~40 min.`
      : `Done: ${results.length} companies, ${totalSaved} contacts. ${remaining} remaining.`,
  });
}

export const maxDuration = 300;
