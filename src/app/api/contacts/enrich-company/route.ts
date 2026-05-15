// Phase 7 — enrich contacts for a target company.
//
// POST /api/contacts/enrich-company
//   { company_id?, companyname, domain?, role_targets?, limit?, dry_run?,
//     prefer_provider? }
//
// Calls the active contact provider, normalizes results, and upserts into
// `contacts` using the enrichment columns added in
// supabase/migrations/0003_contacts_enrichment.sql.

import { NextRequest, NextResponse } from "next/server";
import { requireApiSecret, requireAppOrigin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getContactProvider } from "@/lib/contactProviders/registry";
import type { ContactRoleType, NormalizedContact } from "@/lib/contactProviders/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RequestBody {
  company_id?: number | null;
  companyname?: string;
  domain?: string;
  role_targets?: ContactRoleType[];
  limit?: number;
  dry_run?: boolean;
  prefer_provider?: "rocketreach" | "mock";
}

export async function POST(req: NextRequest) {
  const apiAuth = requireApiSecret(req);
  if (apiAuth) {
    const originAuth = requireAppOrigin(req);
    if (originAuth) return originAuth;
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    /* allow empty */
  }

  if (!body.companyname && !body.company_id) {
    return NextResponse.json({ error: "companyname or company_id required" }, { status: 400 });
  }

  type CompanyRow = {
    id: number;
    companyname: string;
    careers_url?: string | null;
  };
  let companyRow: CompanyRow | null = null;

  if (body.company_id) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("id, companyname, careers_url")
      .eq("id", body.company_id)
      .maybeSingle();
    if (data) companyRow = data as CompanyRow;
  } else if (body.companyname) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("id, companyname, careers_url")
      .ilike("companyname", body.companyname)
      .limit(1);
    if (data && data.length > 0) companyRow = data[0] as CompanyRow;
  }

  const targetName = companyRow?.companyname ?? body.companyname!;
  const provider = getContactProvider(body.prefer_provider);

  const result = await provider.search({
    company_id: companyRow?.id ?? null,
    company_name: targetName,
    domain: body.domain ?? null,
    role_targets: body.role_targets,
    limit: body.limit,
  });

  if (body.dry_run) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      provider: provider.name,
      company: targetName,
      contacts: result.contacts,
      warnings: result.warnings,
      errors: result.errors,
    });
  }

  let inserted = 0;
  let updated = 0;
  const persistWarnings: string[] = [];

  for (const c of result.contacts) {
    const update = await persistContact(c);
    if (update === "inserted") inserted++;
    else if (update === "updated") updated++;
    else if (update.startsWith("error:")) persistWarnings.push(update);
  }

  return NextResponse.json({
    ok: result.errors.length === 0,
    provider: provider.name,
    company: targetName,
    fetched: result.contacts.length,
    inserted,
    updated,
    warnings: [...result.warnings, ...persistWarnings],
    errors: result.errors,
  });
}

async function persistContact(
  c: NormalizedContact
): Promise<"inserted" | "updated" | `error:${string}`> {
  // Existing row matching: by provider_person_id first, then by
  // (companyname, email), then by (companyname, full_name).
  const findByProvider = c.provider_person_id
    ? await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("provider_person_id", c.provider_person_id)
        .limit(1)
    : { data: null, error: null };

  const findByEmail =
    !findByProvider.data?.length && c.email
      ? await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("companyname", c.company_name)
          .eq("email", c.email)
          .limit(1)
      : { data: null, error: null };

  const findByName =
    !findByProvider.data?.length && !findByEmail.data?.length
      ? await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("companyname", c.company_name)
          // Live column is `contactname`, NOT `full_name`.
          .ilike("contactname", c.full_name)
          .limit(1)
      : { data: null, error: null };

  const existingId =
    (findByProvider.data?.[0] as { id?: number } | undefined)?.id ??
    (findByEmail.data?.[0] as { id?: number } | undefined)?.id ??
    (findByName.data?.[0] as { id?: number } | undefined)?.id ??
    null;

  // Map adapter field names → live `contacts` column names:
  //   NormalizedContact.full_name    → contacts.contactname
  //   NormalizedContact.linkedin_url → contacts.linkedin
  const baseFields = {
    companyname: c.company_name,
    contactname: c.full_name,
    title: c.title,
    email: c.email,
    role_type: c.role_type,
    seniority: c.seniority,
    department: c.department,
    is_mines_alumni: c.is_mines_alumni,
    is_possible_pe: c.is_possible_pe,
    email_confidence: c.email_confidence,
    linkedin: c.linkedin_url,
    provider_person_id: c.provider_person_id,
    provider_source: c.source,
    last_enriched_at: new Date().toISOString(),
  };

  if (existingId) {
    const { error } = await supabaseAdmin
      .from("contacts")
      .update(baseFields)
      .eq("id", existingId);
    if (error) return `error:${error.message}` as const;
    return "updated";
  }

  const { error } = await supabaseAdmin.from("contacts").insert(baseFields);
  if (error) return `error:${error.message}` as const;
  return "inserted";
}
