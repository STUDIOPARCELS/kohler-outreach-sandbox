import { requireApiSecret } from "@/lib/auth";
import { mustWrite } from "@/lib/dbGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req); if (authError) return authError;
  try {
    // Find contacts with emails that don't contain @
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, companyname, contactname, email")
      .not("email", "is", null)
      .not("email", "eq", "");

    if (!contacts) return NextResponse.json({ error: "No contacts" });

    const bad = contacts.filter(c => c.email && !c.email.includes("@"));

    let cleaned = 0;
    for (const c of bad) {
      mustWrite(`clean-emails: contact email clear for ${c.contactname}`, await supabaseAdmin
        .from("contacts")
        .update({ email: "" })
        .eq("id", c.id));

      // Also clear from letter drafts
      mustWrite(`clean-emails: letter email clear for ${c.contactname}`, await supabaseAdmin
        .from("reachout_company_inserts")
        .update({ contact_email: null })
        .eq("companyname", c.companyname)
        .eq("contactname", c.contactname));

      cleaned++;
    }

    return NextResponse.json({
      total_checked: contacts.length,
      bad_emails_cleaned: cleaned,
      examples: bad.slice(0, 5).map(c => `${c.contactname} @ ${c.companyname}: "${c.email}"`),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
