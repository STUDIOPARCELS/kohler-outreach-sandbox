import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

const RR_API_KEY = process.env.ROCKETREACH_API_KEY!;
const RR_BASE = "https://api.rocketreach.co";
const BATCH_SIZE = 20; // per invocation to stay within Vercel timeout
const DELAY_MS = 2000;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function lookupPerson(
  name: string,
  employer: string
): Promise<{ email: string; linkedin: string; phone: string } | null> {
  try {
    // First try search by name + employer to get teaser data (free)
    const searchRes = await fetch(`${RR_BASE}/v2/api/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": RR_API_KEY,
      },
      body: JSON.stringify({
        query: {
          name: [name],
          current_employer: [employer],
        },
        start: 1,
        page_size: 1,
      }),
    });

    if (searchRes.status === 429) return null;
    if (!searchRes.ok) return null;

    const data = await searchRes.json();
    if (data.code === "throttled") return null;

    const profiles = data.profiles || [];
    if (profiles.length === 0) return null;

    const p = profiles[0];
    const teaser = p.teaser || {};
    const email = (teaser.emails?.[0] ?? "") as string;

    if (!email) {
      // Try person lookup to get full profile (costs 1 export credit)
      const lookupRes = await fetch(
        `${RR_BASE}/v2/api/person/lookup?name=${encodeURIComponent(name)}&current_employer=${encodeURIComponent(employer)}`,
        {
          headers: { "Api-Key": RR_API_KEY },
        }
      );

      if (lookupRes.status === 429) return null;
      if (!lookupRes.ok) return null;

      const lookupData = await lookupRes.json();
      if (lookupData.code === "throttled") return null;

      const lookupEmail =
        lookupData.current_work_email ||
        lookupData.current_personal_email ||
        (lookupData.emails?.[0]?.email ?? "");

      return {
        email: lookupEmail || "",
        linkedin: lookupData.linkedin_url || p.linkedin_url || "",
        phone:
          lookupData.phones?.[0]?.number ||
          (teaser.phones?.[0] ?? ""),
      };
    }

    return {
      email,
      linkedin: p.linkedin_url || "",
      phone: (teaser.phones?.[0] ?? "") as string,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // Optional: limit batch size from client
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(body.limit || BATCH_SIZE, 50);

  // Get contacts with missing emails
  const { data: contacts, error } = await supabaseAdmin
    .from("contacts")
    .select("id, companyname, contactname, title, email")
    .or("email.is.null,email.eq.")
    .neq("contactname", "(no results)")
    .order("companyname")
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: `DB error: ${error.message}` },
      { status: 500 }
    );
  }

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({
      message: "All contacts have emails. Nothing to backfill.",
      updated: 0,
      remaining: 0,
    });
  }

  const results: {
    id: string;
    name: string;
    company: string;
    email: string;
    status: string;
  }[] = [];
  let rateLimited = false;

  for (const c of contacts) {
    if (rateLimited) break;

    const lookup = await lookupPerson(c.contactname, c.companyname);

    if (lookup === null) {
      // Could be rate limited or no results
      results.push({
        id: c.id,
        name: c.contactname,
        company: c.companyname,
        email: "",
        status: "no_result",
      });
    } else if (lookup.email) {
      // Update the contact with the found email
      const updateFields: Record<string, string> = { email: lookup.email };
      if (lookup.linkedin) updateFields.linkedin = lookup.linkedin;
      if (lookup.phone) updateFields.phone = lookup.phone;

      await supabaseAdmin
        .from("contacts")
        .update(updateFields)
        .eq("id", c.id);

      // Also update any existing letter drafts for this contact
      await supabaseAdmin
        .from("reachout_company_inserts")
        .update({ contact_email: lookup.email })
        .eq("companyname", c.companyname)
        .eq("contactname", c.contactname);

      results.push({
        id: c.id,
        name: c.contactname,
        company: c.companyname,
        email: lookup.email,
        status: "updated",
      });
    } else {
      results.push({
        id: c.id,
        name: c.contactname,
        company: c.companyname,
        email: "",
        status: "no_email_found",
      });
    }

    await delay(DELAY_MS);
  }

  // Count remaining
  const { count } = await supabaseAdmin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .or("email.is.null,email.eq.")
    .neq("contactname", "(no results)");

  const updated = results.filter((r) => r.status === "updated").length;

  console.log(
    `[BACKFILL] Processed ${results.length} contacts. Updated ${updated} emails. Remaining: ${count}`
  );

  return NextResponse.json({
    processed: results.length,
    updated,
    remaining: count || 0,
    rate_limited: rateLimited,
    results,
  });
}

export const maxDuration = 60;
