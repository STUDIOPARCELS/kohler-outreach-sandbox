import { requireApiSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

// Parse "1438 South Broadway, Denver, CO 80210" into parts
function parseAddress(raw: string): {
  street: string; city: string; state: string; zip: string;
} | null {
  if (!raw) return null;
  const match = raw.match(
    /^(.+?),\s*([^,]+?),?\s+([A-Z]{2})\s*,?\s*(\d{5}(?:-\d{4})?)$/
  );
  if (match) {
    return {
      street: match[1].trim(),
      city: match[2].trim(),
      state: match[3].trim(),
      zip: match[4].trim(),
    };
  }
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    const stateZip = lastPart.match(/([A-Z]{2})\s*(\d{5})/);
    if (stateZip) {
      return {
        street: parts.slice(0, -2).join(", "),
        city: parts[parts.length - 2],
        state: stateZip[1],
        zip: stateZip[2],
      };
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req); if (authError) return authError;
  const results = {
    addresses_merged: 0,
    addresses_skipped: 0,
    addresses_parse_failed: [] as string[],
    contacts_merged: 0,
    contacts_skipped: 0,
    contacts_updated: 0,
    letters_email_updated: 0,
  };

  // 1. Merge temp_company_addresses → companies
  const { data: tempAddrs } = await supabaseAdmin
    .from("temp_company_addresses")
    .select("*");

  if (tempAddrs) {
    for (const row of tempAddrs) {
      const name = row.companyname;
      if (!name) continue;

      const { data: existing } = await supabaseAdmin
        .from("companies")
        .select("mailing_address1")
        .eq("companyname", name)
        .limit(1);

      if (existing?.[0]?.mailing_address1) {
        results.addresses_skipped++;
        continue;
      }

      const parsed = parseAddress(row.mailing_address);
      if (!parsed) {
        results.addresses_parse_failed.push(`${name}: "${row.mailing_address}"`);
        continue;
      }

      const { error } = await supabaseAdmin
        .from("companies")
        .update({
          mailing_address1: parsed.street,
          mailing_city: parsed.city,
          mailing_state: parsed.state,
          mailing_zip: parsed.zip,
        })
        .eq("companyname", name);

      if (!error) results.addresses_merged++;
    }
  }

  // 2. Merge tier_1_4_contacts → contacts
  const { data: tierContacts } = await supabaseAdmin
    .from("tier_1_4_contacts")
    .select("*");

  if (tierContacts) {
    for (const tc of tierContacts) {
      if (!tc.companyname || !tc.contactname) continue;
      if (tc.contactname === "(no results)") continue;

      const { data: existing } = await supabaseAdmin
        .from("contacts")
        .select("id, email, title")
        .eq("companyname", tc.companyname)
        .ilike("contactname", tc.contactname)
        .limit(1);

      if (existing && existing.length > 0) {
        const updates: Record<string, string> = {};
        if (tc.email && !existing[0].email) updates.email = tc.email;
        if (tc.title && (!existing[0].title || existing[0].title.length < (tc.title || "").length)) {
          updates.title = tc.title;
        }
        if (Object.keys(updates).length > 0) {
          await supabaseAdmin.from("contacts").update(updates).eq("id", existing[0].id);
          results.contacts_updated++;
        } else {
          results.contacts_skipped++;
        }
      } else {
        await supabaseAdmin.from("contacts").insert({
          companyname: tc.companyname,
          contactname: tc.contactname,
          title: tc.title || "",
          email: tc.email || "",
          linkedin: tc.linkedin || "",
          phone: tc.phone || "",
          notes: tc.notes || "From tier_1_4_contacts",
        });
        results.contacts_merged++;
      }
    }
  }

  // 3. Update reachout_company_inserts with contact emails where missing
  const { data: letters } = await supabaseAdmin
    .from("reachout_company_inserts")
    .select("id, companyname, contactname, contact_email, contact_title")
    .or("contact_email.is.null,contact_email.eq.");

  if (letters) {
    for (const l of letters) {
      if (!l.contactname) continue;
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("email, title")
        .eq("companyname", l.companyname)
        .ilike("contactname", l.contactname)
        .not("email", "is", null)
        .not("email", "eq", "")
        .limit(1);

      if (contact?.[0]?.email) {
        await supabaseAdmin
          .from("reachout_company_inserts")
          .update({
            contact_email: contact[0].email,
            contact_title: contact[0].title || l.contact_title,
          })
          .eq("id", l.id);
        results.letters_email_updated++;
      }
    }
  }

  return NextResponse.json(results);
}
