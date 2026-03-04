import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  // 1. Check temp_company_addresses
  const { data: tempAddrs, error: tempErr } = await supabaseAdmin
    .from("temp_company_addresses")
    .select("*")
    .limit(5);

  if (tempErr) {
    return NextResponse.json({ error: `temp_company_addresses: ${tempErr.message}` });
  }

  // Show structure
  const sample = tempAddrs?.[0] || {};
  const columns = Object.keys(sample);

  // Count
  const { count: tempCount } = await supabaseAdmin
    .from("temp_company_addresses")
    .select("*", { count: "exact", head: true });

  // 2. Check companies table address fields
  const { data: companySample } = await supabaseAdmin
    .from("companies")
    .select("companyname, mailing_address1, mailing_address2, mailing_city, mailing_state, mailing_zip")
    .not("mailing_address1", "is", null)
    .not("mailing_address1", "eq", "")
    .limit(5);

  const { count: hasAddrCount } = await supabaseAdmin
    .from("companies")
    .select("*", { count: "exact", head: true })
    .not("mailing_address1", "is", null)
    .not("mailing_address1", "eq", "");

  // 3. Also check tier_1_4_contacts
  const { data: tierContacts, error: tierErr } = await supabaseAdmin
    .from("tier_1_4_contacts")
    .select("*")
    .limit(5);

  const { count: tierCount } = await supabaseAdmin
    .from("tier_1_4_contacts")
    .select("*", { count: "exact", head: true });

  // 4. Check candidate_assets, candidate_profile
  const { data: profile } = await supabaseAdmin
    .from("candidate_profile")
    .select("*")
    .limit(3);

  // 5. List all other tables with data
  const tableChecks: Record<string, number | null> = {};
  const tables = [
    "companies_backup_20260304",
    "jobs",
    "reachout_company_inserts",
    "reachout_final_letters",
    "reachout_template",
    "tracking",
    "reno_deals",
  ];
  for (const t of tables) {
    try {
      const { count } = await supabaseAdmin.from(t).select("*", { count: "exact", head: true });
      tableChecks[t] = count;
    } catch {
      tableChecks[t] = null;
    }
  }

  return NextResponse.json({
    temp_company_addresses: {
      count: tempCount,
      columns,
      sample: tempAddrs?.slice(0, 3),
    },
    companies_with_addresses: {
      count: hasAddrCount,
      sample: companySample,
    },
    tier_1_4_contacts: {
      count: tierCount,
      sample: tierContacts?.slice(0, 3),
      error: tierErr?.message,
    },
    candidate_profile: profile,
    other_tables: tableChecks,
  });
}

export async function POST() {
  // Merge temp_company_addresses into companies
  const { data: tempAddrs, error } = await supabaseAdmin
    .from("temp_company_addresses")
    .select("*");

  if (error || !tempAddrs) {
    return NextResponse.json({ error: error?.message || "No data" }, { status: 500 });
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of tempAddrs) {
    // Try to match by company name
    const name = row.companyname || row.company_name || row.name;
    if (!name) { skipped++; continue; }

    // Build update object from whatever columns exist
    const update: Record<string, string> = {};
    if (row.mailing_address1 || row.address1 || row.address || row.street) {
      update.mailing_address1 = row.mailing_address1 || row.address1 || row.address || row.street;
    }
    if (row.mailing_address2 || row.address2 || row.suite) {
      update.mailing_address2 = row.mailing_address2 || row.address2 || row.suite || "";
    }
    if (row.mailing_city || row.city) {
      update.mailing_city = row.mailing_city || row.city;
    }
    if (row.mailing_state || row.state) {
      update.mailing_state = row.mailing_state || row.state;
    }
    if (row.mailing_zip || row.zip || row.zipcode || row.postal_code) {
      update.mailing_zip = row.mailing_zip || row.zip || row.zipcode || row.postal_code;
    }

    if (Object.keys(update).length === 0) { skipped++; continue; }

    const { error: upErr } = await supabaseAdmin
      .from("companies")
      .update(update)
      .eq("companyname", name);

    if (upErr) {
      errors.push(`${name}: ${upErr.message}`);
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    total: tempAddrs.length,
    updated,
    skipped,
    errors: errors.slice(0, 10),
  });
}
