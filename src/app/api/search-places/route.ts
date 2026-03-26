import { requireAppOrigin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const { query, location = "Denver, Colorado" } = await req.json();

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  if (!GOOGLE_PLACES_KEY) {
    return NextResponse.json(
      { error: "Google Places API key not configured." },
      { status: 503 }
    );
  }

  try {
    // Text search for the company
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      query + " " + location
    )}&type=establishment&key=${GOOGLE_PLACES_KEY}`;

    const res = await fetch(searchUrl);
    if (!res.ok) {
      return NextResponse.json({ error: `Places API error: ${res.status}` }, { status: 500 });
    }

    const data = await res.json();
    
    // Filter out obviously non-engineering business types
    const rejectTypes = new Set([
      "restaurant", "cafe", "bar", "meal_delivery", "meal_takeaway",
      "store", "shopping_mall", "clothing_store", "shoe_store", "jewelry_store",
      "grocery_or_supermarket", "supermarket", "convenience_store", "department_store",
      "gym", "spa", "beauty_salon", "hair_care", "laundry", "dry_cleaning",
      "school", "university", "secondary_school", "primary_school",
      "church", "place_of_worship", "cemetery", "funeral_home",
      "lodging", "hotel", "motel", "campground", "rv_park",
      "car_wash", "gas_station", "parking",
      "bank", "insurance_agency", "accounting",
      "real_estate_agency", "lawyer", "dentist", "doctor", "veterinary_care",
      "pharmacy",
      "library", "museum", "art_gallery", "movie_theater", "amusement_park",
      "night_club", "bowling_alley", "casino",
      "post_office", "city_hall", "courthouse", "fire_station", "police",
      "travel_agency", "car_rental", "taxi_stand",
      "pet_store", "florist", "book_store",
    ]);

    const filtered = (data.results || []).filter((r: Record<string, unknown>) => {
      const types = (r.types as string[]) || [];
      // Reject if ANY type matches a non-engineering category
      const hasRejectType = types.some(t => rejectTypes.has(t));
      return !hasRejectType;
    });

    const results = filtered.slice(0, 8).map(
      (r: Record<string, unknown>) => {
        const address = (r.formatted_address as string) || "";
        const parts = address.split(",").map((s) => s.trim());

        let address1 = parts[0] || "";
        let city = "Denver";
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

        // Build a description from types
        const types = (r.types as string[]) || [];
        const typeLabels: Record<string, string> = {
          point_of_interest: "",
          establishment: "",
          store: "Retail",
          shopping_mall: "Shopping",
          food: "Food & Beverage",
          restaurant: "Restaurant",
          car_dealer: "Automotive",
          car_repair: "Automotive",
          gym: "Fitness",
          health: "Health",
          hospital: "Medical",
          school: "Education",
          university: "Education",
          electronics_store: "Electronics",
          hardware_store: "Hardware",
          furniture_store: "Furniture",
          home_goods_store: "Home Goods",
          general_contractor: "Construction",
          electrician: "Electrical",
          plumber: "Plumbing",
          roofing_contractor: "Roofing",
          storage: "Storage",
          moving_company: "Moving",
        };

        const meaningful = types
          .map((t) => typeLabels[t])
          .filter((t) => t && t.length > 0);
        const typeDesc = Array.from(new Set(meaningful)).slice(0, 2).join(" · ");

        return {
          name: r.name as string,
          address: address,
          address1,
          city,
          state,
          zip,
          types: typeDesc || null,
          rating: r.rating || null,
          user_ratings_total: r.user_ratings_total || null,
          business_status: r.business_status || null,
          place_id: r.place_id as string,
        };
      }
    );

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
