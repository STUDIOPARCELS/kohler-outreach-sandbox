const ORIGIN_ZIP = "80226";

const ZIP_COORDS: Record<string, [number, number]> = {
  "80002": [39.7945, -105.0984],
  "80011": [39.7378, -104.8152],
  "80014": [39.6662, -104.835],
  "80017": [39.6948, -104.7881],
  "80020": [39.9245, -105.0609],
  "80021": [39.8854, -105.1139],
  "80022": [39.8259, -104.9113],
  "80026": [39.998, -105.0963],
  "80027": [39.9789, -105.1456],
  "80031": [39.8753, -105.0345],
  "80033": [39.774, -105.0962],
  "80104": [39.3926, -104.8602],
  "80110": [39.6463, -105.0092],
  "80111": [39.6123, -104.8799],
  "80112": [39.5805, -104.9011],
  "80113": [39.6405, -104.9614],
  "80120": [39.5994, -105.0044],
  "80122": [39.5814, -104.9557],
  "80124": [39.5506, -104.8972],
  "80125": [39.4845, -105.0561],
  "80127": [39.592, -105.1328],
  "80129": [39.5397, -105.0109],
  "80202": [39.7491, -104.9946],
  "80203": [39.7313, -104.9811],
  "80204": [39.734, -105.0259],
  "80205": [39.759, -104.9661],
  "80207": [39.7584, -104.9177],
  "80210": [39.679, -104.9631],
  "80211": [39.7665, -105.0204],
  "80212": [39.7683, -105.0493],
  "80215": [39.7435, -105.1009],
  "80216": [39.7835, -104.9669],
  "80218": [39.7327, -104.9717],
  "80219": [39.6956, -105.0341],
  "80220": [39.7312, -104.9129],
  "80221": [39.838, -104.9988],
  "80222": [39.671, -104.9279],
  "80223": [39.7002, -105.0028],
  "80226": [39.7123, -105.0918],
  "80229": [39.8671, -104.9227],
  "80234": [39.9108, -105.0109],
  "80235": [39.6472, -105.0795],
  "80237": [39.6431, -104.8987],
  "80239": [39.7878, -104.8288],
  "80241": [39.9274, -104.9548],
  "80260": [39.8672, -105.0041],
  "80301": [40.0497, -105.2143],
  "80302": [40.0172, -105.2851],
  "80401": [39.7305, -105.1915],
  "80403": [39.8232, -105.2825],
  "80437": [39.522, -105.2239],
  "80465": [39.6125, -105.1746],
  "80503": [40.1559, -105.1624],
  "80513": [40.2993, -105.1055],
  "80524": [40.5986, -105.0581],
  "80525": [40.5384, -105.0547],
  "80537": [40.3849, -105.0916],
  "80538": [40.4262, -105.09],
  "80601": [39.943, -104.7866],
  "80640": [39.8983, -104.8718],
  "80903": [38.8388, -104.8145],
  "80907": [38.876, -104.817],
  "80916": [38.8076, -104.7403],
  "80920": [38.9497, -104.767],
  "80921": [39.0487, -104.814],
};

const CITY_FALLBACK_MILES: Record<string, number> = {
  arvada: 8,
  aurora: 18,
  boulder: 27,
  broomfield: 20,
  centennial: 19,
  denver: 7,
  englewood: 11,
  golden: 8,
  "greenwood village": 16,
  "highlands ranch": 18,
  lakewood: 3,
  lafayette: 24,
  littleton: 13,
  longmont: 39,
  louisville: 22,
  westminster: 13,
  "colorado springs": 73,
};

const NICHE_POINTS: Record<string, number> = {
  "MEP / HVAC / Building Systems": 18,
  "Government / Public Works / Infrastructure": 18,
  "Water / Environmental / Geotech": 16,
  "Aerospace / Space": 15,
  "Quantum / Deep Tech / Electronics / Robotics": 15,
  "Manufacturing / Automation / Product Design": 14,
  "Energy / Renewables / Power": 14,
  "Construction / Civil / Heavy Industry": 10,
  "Metals / Material Science": 8,
  "Automotive / Vehicles": 6,
  "Medical / Biotech": 5,
};

export interface OutreachScoreInput {
  tier?: number | null;
  niche?: string | null;
  city?: string | null;
  mailing_zip?: string | null;
  careers_url?: string | null;
  roles?: number | null;
  contact_count?: number | null;
  email_count?: number | null;
  mines_alumni_count?: number | null;
}

export interface OutreachScore {
  outreach_score: number;
  score_label: "Hot" | "Strong" | "Warm" | "Low";
  score_reasons: string[];
  distance_miles: number | null;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radiusMiles = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateDistanceMiles(input: Pick<OutreachScoreInput, "mailing_zip" | "city">): number | null {
  const zip = (input.mailing_zip || "").match(/\b\d{5}\b/)?.[0] || "";
  const origin = ZIP_COORDS[ORIGIN_ZIP];
  const destination = ZIP_COORDS[zip];
  if (origin && destination) {
    return Math.round(haversineDistance(origin[0], origin[1], destination[0], destination[1]));
  }

  const city = (input.city || "").toLowerCase().trim();
  const cityKey = Object.keys(CITY_FALLBACK_MILES).find((key) => city.includes(key));
  return cityKey ? CITY_FALLBACK_MILES[cityKey] : null;
}

export function computeOutreachScore(input: OutreachScoreInput): OutreachScore {
  const reasons: string[] = [];
  let score = 0;

  const roles = input.roles || 0;
  if (roles > 0) {
    const points = Math.min(24, 10 + roles * 4);
    score += points;
    reasons.push(`${roles} tracked role${roles === 1 ? "" : "s"}`);
  }

  const nichePoints = NICHE_POINTS[input.niche || ""] || 0;
  if (nichePoints > 0) {
    score += nichePoints;
    reasons.push("target niche");
  }

  const emailCount = input.email_count || 0;
  const contactCount = input.contact_count || 0;
  if (emailCount > 0) {
    score += Math.min(20, 12 + emailCount * 3);
    reasons.push(`${emailCount} email contact${emailCount === 1 ? "" : "s"}`);
  } else if (contactCount > 0) {
    score += Math.min(10, contactCount * 3);
    reasons.push(`${contactCount} contact${contactCount === 1 ? "" : "s"}`);
  }

  const distance = estimateDistanceMiles(input);
  if (distance !== null) {
    if (distance <= 10) score += 14;
    else if (distance <= 20) score += 11;
    else if (distance <= 35) score += 7;
    else if (distance <= 60) score += 4;
    reasons.push(`${distance} mi from 80226`);
  }

  if (input.careers_url) {
    score += 6;
    reasons.push("career page tracked");
  }

  const tier = input.tier || 5;
  score += ({ 1: 8, 2: 6, 3: 4, 4: 2 } as Record<number, number>)[tier] || 0;

  const alumniCount = input.mines_alumni_count || 0;
  if (alumniCount > 0) {
    score += Math.min(20, alumniCount * 5);
    reasons.push(`${alumniCount} Mines alum${alumniCount === 1 ? "" : "s"}`);
  }

  const outreach_score = Math.max(0, Math.min(100, Math.round(score)));
  const score_label = outreach_score >= 75 ? "Hot" : outreach_score >= 55 ? "Strong" : outreach_score >= 35 ? "Warm" : "Low";
  return { outreach_score, score_label, score_reasons: reasons, distance_miles: distance };
}
