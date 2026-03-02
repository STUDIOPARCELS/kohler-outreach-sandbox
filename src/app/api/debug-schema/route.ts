import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  // List all tables and views in the public schema
  const { data: tables, error: tablesErr } = await supabaseAdmin.rpc("get_schema_info").select("*");

  // If RPC doesn't exist, try querying known tables directly
  const results: Record<string, unknown> = {};

  const tableNames = [
    "outreach_list_no_roles",
    "companies",
    "contacts",
    "reachout_company_inserts",
    "reachout_final_letters",
    "reachout_template",
    "open_roles_list",
    "relevant_roles",
    "candidate_profile",
  ];

  for (const t of tableNames) {
    const { data, error, count } = await supabaseAdmin
      .from(t)
      .select("*", { count: "exact", head: false })
      .limit(2);

    results[t] = {
      exists: !error,
      error: error?.message || null,
      count: count,
      sample: data?.slice(0, 2) || null,
      columns: data && data.length > 0 ? Object.keys(data[0]) : null,
    };
  }

  return NextResponse.json({
    rpc_result: tables || tablesErr?.message,
    tables: results,
  });
}
