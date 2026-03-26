import { requireApiSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req); if (authError) return authError;
  if (!GOOGLE_PLACES_KEY) {
    return NextResponse.json({
      error: "Google Places API key not configured. Add GOOGLE_PLACES_API_KEY to Vercel environment variables.",
      needsApiKey: true,
    }, { status: 503 });
  }

  const { limit = 20 } = await req.json().catch(() => ({ limit: 20 }));

  // Get companies missing mailing_address1
  const { data: companies, error } = await supabaseAdmin
    .from("companies")
    .select("id, companyname, city, mailing_address1")
    .is("mailing_address1", null)
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!companies || companies.length === 0) {
    return NextResponse.json({ updated: 0, message: "No companies missing addresses." });
  }

  let updated = 0;
  const errors: string[] = [];

  for (const co of companies) {
    try {
      const query = `${co.companyname} ${co.city || "Denver"} Colorado`;
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=establishment&key=${GOOGLE_PLACES_KEY}`;
      
      const res = await fetch(searchUrl);
      if (!res.ok) {
        errors.push(`${co.companyname}: Places API returned ${res.status}`);
        continue;
      }

      const data = await res.json();
      const results = data.results || [];
      
      if (results.length === 0) {
        errors.push(`${co.companyname}: no Places results`);
        continue;
      }

      // Take the first result
      const place = results[0];
      const address = place.formatted_address || "";
      
      // Parse address: "123 Main St, Denver, CO 80202, USA"
      const parts = address.split(",").map((s: string) => s.trim());
      let address1 = parts[0] || "";
      let city = co.city || "Denver";
      let state = "CO";
      let zip = "";

      if (parts.length >= 3) {
        city = parts[parts.length - 3] || parts[1] || city;
        const stateZip = parts[parts.length - 2] || "";
        const match = stateZip.match(/^([A-Z]{2})\s*(\d{5})?/);
        if (match) {
          state = match[1];
          zip = match[2] || "";
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from("companies")
        .update({
          mailing_address1: address1,
          mailing_city: city,
          mailing_state: state,
          mailing_zip: zip,
        })
        .eq("id", co.id);

      if (updateError) {
        errors.push(`${co.companyname}: ${updateError.message}`);
      } else {
        updated++;
      }

      // Rate limit: 200ms between requests
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      errors.push(`${co.companyname}: ${(e as Error).message}`);
    }
  }

  // Count total remaining
  const { count: remainingCount } = await supabaseAdmin
    .from("companies")
    .select("*", { count: "exact", head: true })
    .is("mailing_address1", null);

  return NextResponse.json({
    processed: companies.length,
    updated,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    remaining: (remainingCount || 0) - updated,
    message: `Updated ${updated} of ${companies.length} companies. ${errors.length} errors. ${(remainingCount || 0) - updated} still missing.`,
  });
}
