import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const RR_API_KEY = "ac2b96kfab306c1fce8fda977e8fc6262f0f17a";
const RR_BASE = "https://api.rocketreach.co";

// Niche → Google Places search terms
const NICHE_SEARCH_TERMS: Record<string, string[]> = {
  "Skiing": ["ski manufacturer", "ski equipment company", "ski gear"],
  "Acoustics / Audio / Musical Instruments": ["audio equipment manufacturer", "musical instrument manufacturer", "acoustics company"],
  "Outdoor Recreation & Equipment": ["outdoor equipment manufacturer", "camping gear company", "outdoor recreation"],
  "Automotive / Vehicles": ["automotive manufacturer", "vehicle engineering", "automotive parts manufacturer"],
  "Woodworking / Furniture / Cabinetry / Prototyping": ["custom furniture manufacturer", "cabinetry company", "woodworking shop", "prototyping company"],
  "Energy / Renewables / Power": ["renewable energy company", "solar energy manufacturer", "wind energy company"],
  "Metals / Material Science": ["metal fabrication", "materials science company", "metallurgy", "metal 3D printing"],
  "Manufacturing / Automation / Product Design": ["manufacturing company", "automation company", "product design firm"],
  "Quantum / Deep Tech / Electronics / Robotics": ["robotics company", "electronics manufacturer", "deep tech company"],
  "Construction / Civil / Heavy Industry": ["construction company", "civil engineering firm", "heavy equipment"],
  "MEP / HVAC / Building Systems": ["HVAC company", "mechanical engineering firm", "building systems"],
  "Water / Environmental / Geotech": ["environmental engineering", "water treatment company", "geotechnical firm"],
  "Aerospace / Space": ["aerospace company", "space technology", "satellite manufacturer"],
  "Medical / Biotech": ["medical device manufacturer", "biotech company", "biomedical engineering"],
  "Food / Beverage Manufacturing": ["food manufacturing", "beverage manufacturer", "food processing company"],
};

// Search Google Places API for companies
async function searchGooglePlaces(query: string, location = "Denver, CO") {
  if (!GOOGLE_PLACES_KEY) return [];

  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query + " " + location
  )}&type=establishment&key=${GOOGLE_PLACES_KEY}`;

  const res = await fetch(searchUrl);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).map((r: Record<string, unknown>) => ({
    name: r.name as string,
    address: r.formatted_address as string,
    place_id: r.place_id as string,
    lat: (r.geometry as Record<string, Record<string, number>>)?.location?.lat,
    lng: (r.geometry as Record<string, Record<string, number>>)?.location?.lng,
  }));
}

// Parse address into components
function parseAddress(address: string) {
  // Try to parse "123 Main St, Denver, CO 80202, USA"
  const parts = address.split(",").map((s) => s.trim());
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 2].trim();
    const stateZipMatch = stateZip.match(/^([A-Z]{2})\s*(\d{5})?/);
    return {
      address1: parts[0],
      city: parts[parts.length - 3] || parts[1],
      state: stateZipMatch?.[1] || "CO",
      zip: stateZipMatch?.[2] || "",
    };
  }
  return { address1: address, city: "Denver", state: "CO", zip: "" };
}

// Research contacts for a single company via RocketReach
async function researchContacts(companyname: string) {
  try {
    const searchRes = await fetch(`${RR_BASE}/v2/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Api-Key": RR_API_KEY },
      body: JSON.stringify({
        query: {
          current_employer: [companyname],
          current_title: [
            "Engineering Manager", "Director of Engineering", "VP of Engineering",
            "Head of Engineering", "Chief Engineer", "R&D Manager", "Plant Manager",
            "Product Development Manager", "Manufacturing Manager",
          ],
          location: ["Colorado"],
        },
        start: 1,
        page_size: 3,
        order_by: "popularity",
      }),
    });

    if (!searchRes.ok) return [];
    const data = await searchRes.json();
    if (data.code === "throttled") return [];
    return data.profiles || [];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const { niche, mode, company: manualCompany } = await req.json();

    if (!niche) {
      return NextResponse.json({ error: "niche is required" }, { status: 400 });
    }

    // MODE: "manual" — add a single company by name
    if (mode === "manual") {
      if (!manualCompany?.name) {
        return NextResponse.json({ error: "Company name is required" }, { status: 400 });
      }

      // Check if already exists
      const { data: existing } = await supabaseAdmin
        .from("companies")
        .select("id")
        .ilike("companyname", manualCompany.name)
        .limit(1);

      if (existing && existing.length > 0) {
        return NextResponse.json({
          added: 0,
          message: `${manualCompany.name} already exists in the database.`,
          alreadyExists: true,
        });
      }

      const row = {
        companyname: manualCompany.name,
        city: manualCompany.city || "Denver",
        niche,
        tier: 4,
        mailing_address1: manualCompany.address1 || null,
        mailing_city: manualCompany.city || "Denver",
        mailing_state: manualCompany.state || "CO",
        mailing_zip: manualCompany.zip || null,
        company_about: manualCompany.about || null,
      };

      const { error } = await supabaseAdmin.from("companies").insert(row);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Auto-research contacts
      let contactsFound = 0;
      try {
        const profiles = await researchContacts(manualCompany.name);
        for (const p of profiles) {
          const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(" ");
          if (!name) continue;
          const teaser = p.teaser || {};
          let email = ((teaser.emails?.[0] ?? "") as string).includes("@") ? (teaser.emails?.[0] as string) : "";
          
          // Try person lookup for email
          if (!email) {
            try {
              const lookupRes = await fetch(
                `${RR_BASE}/v2/api/person/lookup?name=${encodeURIComponent(name)}&current_employer=${encodeURIComponent(manualCompany.name)}`,
                { headers: { "Api-Key": RR_API_KEY } }
              );
              if (lookupRes.ok) {
                const ld = await lookupRes.json();
                email = ld.current_work_email || ld.current_personal_email || "";
              }
              await new Promise(r => setTimeout(r, 500));
            } catch { /* continue */ }
          }

          await supabaseAdmin.from("contacts").insert({
            companyname: manualCompany.name,
            contactname: name,
            title: p.current_title || "",
            email,
            linkedin: p.linkedin_url || "",
            notes: `RocketReach ${new Date().toISOString().split("T")[0]}`,
          });
          contactsFound++;
        }
      } catch { /* non-critical */ }

      return NextResponse.json({
        added: 1,
        contactsFound,
        message: `Added ${manualCompany.name}${contactsFound > 0 ? ` with ${contactsFound} contacts` : ""}.`,
      });
    }

    // MODE: "search" — find companies via Google Places
    if (!GOOGLE_PLACES_KEY) {
      return NextResponse.json({
        error: "Google Places API key not configured. Add GOOGLE_PLACES_API_KEY to environment variables, or use manual add.",
        needsApiKey: true,
      }, { status: 503 });
    }

    const searchTerms = NICHE_SEARCH_TERMS[niche] || [`${niche} company`];
    const allResults: { name: string; address: string; place_id: string }[] = [];

    for (const term of searchTerms.slice(0, 2)) {
      const results = await searchGooglePlaces(term);
      allResults.push(...results);
      await new Promise(r => setTimeout(r, 200));
    }

    // Deduplicate by name
    const seen = new Set<string>();
    const unique = allResults.filter(r => {
      const key = r.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Check which already exist
    const existingNames = new Set<string>();
    for (const r of unique) {
      const { data } = await supabaseAdmin
        .from("companies")
        .select("id")
        .ilike("companyname", r.name)
        .limit(1);
      if (data && data.length > 0) existingNames.add(r.name.toLowerCase());
    }

    const newCompanies = unique.filter(r => !existingNames.has(r.name.toLowerCase()));

    // Add new companies
    let added = 0;
    for (const r of newCompanies.slice(0, 10)) {
      const addr = parseAddress(r.address);
      const { error } = await supabaseAdmin.from("companies").insert({
        companyname: r.name,
        city: addr.city,
        niche,
        tier: 4,
        mailing_address1: addr.address1,
        mailing_city: addr.city,
        mailing_state: addr.state,
        mailing_zip: addr.zip,
      });
      if (!error) added++;
    }

    return NextResponse.json({
      found: unique.length,
      alreadyExisted: existingNames.size,
      added,
      message: `Found ${unique.length} companies, ${existingNames.size} already existed, added ${added} new.`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
