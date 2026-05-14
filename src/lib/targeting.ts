export const TODAY_EXCLUDED_NICHES = [
  "TEST",
  "Skiing",
  "Woodworking / Furniture / Cabinetry / Prototyping",
  "Acoustics / Audio / Musical Instruments",
  "Outdoor Recreation & Equipment",
  "Food / Beverage Manufacturing",
] as const;

export const CAREER_INGEST_TARGET_NICHES = [
  "MEP / HVAC / Building Systems",
  "Government / Public Works / Infrastructure",
  "Aerospace / Space",
  "Quantum / Deep Tech / Electronics / Robotics",
  "Manufacturing / Automation / Product Design",
  "Energy / Renewables / Power",
  "Water / Environmental / Geotech",
  "Metals / Material Science",
] as const;

const EXCLUDED_NICHE_PATTERNS = [
  /^test$/i,
  /\bski(?:ing)?\b/i,
  /\bwoodworking\b|\bfurniture\b|\bcabinetry\b|\bmillwork\b/i,
  /\bacoustics?\b|\baudio\b|\bmusical\s+instruments?\b/i,
  /\boutdoor\s+recreation\b|\boutdoor\s+equipment\b/i,
  /\bfood\b|\bbeverage\b/i,
  /\bstaffing\b|\brecruiting\b/i,
];

const STAFFING_AGENCY_PATTERNS = [
  /\bactalent\b/i,
  /\baerotek\b/i,
  /\bapproach\s+venture\b/i,
  /\bbabich\b/i,
  /\bbelcan\b/i,
  /\bbradley\s*&\s*associates\b/i,
  /\bc4\s+technical\b/i,
  /\bchipton\s+ross\b/i,
  /\bcybercoders\b/i,
  /\bespo\s+corporation\b/i,
  /\bexpress\s+employment\b/i,
  /\bepc\s+staff\b/i,
  /\bfutures\s+consulting\b/i,
  /\bkellyconnect\b/i,
  /\binsight\s+global\b/i,
  /\bjcsi\b/i,
  /\bjobot\b/i,
  /\bjohnson\s+service\s+group\b/i,
  /\bjpi\b/i,
  /\bkronos\s+consulting\b/i,
  /\bliberty\s+personnel\b/i,
  /\bnetgroup\b/i,
  /\bpacer\b/i,
  /\bpop[-\s]?up\s+talent\b/i,
  /\bprofessional\s+employment\s+group\b/i,
  /\brandstad\b/i,
  /\brobert\s+half\b/i,
  /\bsoftcom\s+systems\b/i,
  /\bsupplied\s+talent\b/i,
  /\btalentburst\b/i,
  /\bthree\s+point\s+solutions\b/i,
  /\ballstem\s+connections\b/i,
  /\balten\s+technology\b/i,
  /\bzobility\b/i,
  /\bzen\s+sherpa\b/i,
  /\bharrison\s+consulting\s+solutions\b/i,
  /\bstaffing\b|\brecruit(?:er|ing)\b|\bpersonnel\b|\btalent\s+acquisition\b/i,
];

const NICHE_ALIASES: Record<string, string> = {
  "MEP / HVAC / Facilities": "MEP / HVAC / Building Systems",
  "Manufacturing / Consumer Products": "Manufacturing / Automation / Product Design",
};

const COMPANY_NICHE_OVERRIDES: Array<[RegExp, string]> = [
  [/\b(?:smith\s+seckman\s+reid|henderson\s+engineers|hendersonco|the\s+rmh\s+group|way\s+mechanical|me&p\s+management|legence|jetson\s+home|safe\s+air\s+technology|blender\s+products|farnsworth|o'?brien\s+engineering|wold\s+architects)\b/i, "MEP / HVAC / Building Systems"],
  [/\b(?:cdot|colorado\s+department\s+of\s+transportation|air\s+force\s+civilian\s+service|disa\s+technologies)\b/i, "Government / Public Works / Infrastructure"],
  [/\b(?:brown\s+and\s+caldwell|knight\s+pi[eé]sold|anchor\s+engineering|tetratech|cdm\s+smith)\b/i, "Water / Environmental / Geotech"],
  [/\b(?:paragon\s+space|hummingbird\s+aero|raytheon|pilatus\s+aircraft|shield\s+ai|southwest\s+research\s+institute|first\s+rf|eoi\s+space|lunar\s+outpost|red\s+6|national\s+solar\s+observatory|association\s+of\s+universities\s+for\s+research\s+in\s+astronomy|aura|barber-?nichols|aerocom\s+industries)\b/i, "Aerospace / Space"],
  [/\b(?:ionq|atom\s+computing|maybell\s+quantum|amp\s+robotics|nova\s+automation|outrider|spectra\s+logic|nlight|meadowlark\s+optics|aureate\s+technologies|accelsius)\b/i, "Quantum / Deep Tech / Electronics / Robotics"],
  [/\b(?:enabled\s+energy|rowan\s+digital\s+infrastructure|cofan\s+thermal|vpe\s+thermal|e2companies|falcon\s+power|quality\s+electrical\s+systems|xcimer\s+energy|liberty\s+energy|geodynamics)\b/i, "Energy / Renewables / Power"],
  [/\b(?:wanco|karcher|the\s+toro\s+company|productivity|todd\s+technologies|imagetek|ringspann|stolle\s+machinery|acorn\s+product\s+development|structural\s+integrity\s+associates|tote\s+systems|sematool|tampoprint|arrigo\s+enterprises|beehive|production\s+products|codi\s+manufacturing|basile\s+studio|halker\s+consulting|guinn\s+partners|verotouch|h3x\s+technologies|s[i1]\s+solutions)\b/i, "Manufacturing / Automation / Product Design"],
  [/\b(?:voestalpine|u\.s\.\s+pipe|steel\s+storage\s+systems|boyds\s+machine\s+shop|fortius\s+metals|coorstek)\b/i, "Metals / Material Science"],
  [/\b(?:shrewsberry|merrick\s+&\s+company|merrick\s+and\s+company|exponent|fm\s+construction|mastec|rick\s+engineering|stantec|hdr|haskell|hntb|apex\s+engineers)\b/i, "Construction / Civil / Heavy Industry"],
  [/\b(?:rad\s+source|diversatek|ge\s+healthcare|conmed|stryker)\b/i, "Medical / Biotech"],
  [/\b(?:featherbuilt|titan\s+vans)\b/i, "Automotive / Vehicles"],
];

function inferNiche(companyname?: string | null, titleText?: string | null): string | null {
  const combined = `${companyname || ""} ${titleText || ""}`;
  for (const [pattern, niche] of COMPANY_NICHE_OVERRIDES) {
    if (pattern.test(combined)) return niche;
  }
  if (/\b(?:hvac|mep|mechanical\s+systems?|building\s+systems?|plumbing|piping|thermal\s+comfort)\b/i.test(combined)) {
    return "MEP / HVAC / Building Systems";
  }
  if (/\b(?:transportation|highway|bridge|public\s+works|government|state\s+of\s+colorado|federal)\b/i.test(combined)) {
    return "Government / Public Works / Infrastructure";
  }
  if (/\b(?:water|wastewater|environmental|geotech|geotechnical)\b/i.test(combined)) {
    return "Water / Environmental / Geotech";
  }
  if (/\b(?:space|aerospace|satellite|propulsion|avionics|aircraft|defense)\b/i.test(combined)) {
    return "Aerospace / Space";
  }
  if (/\b(?:robotics?|mechatronics?|automation|quantum|electronics?|electromechanical|optics?)\b/i.test(combined)) {
    return "Quantum / Deep Tech / Electronics / Robotics";
  }
  if (/\b(?:energy|power|solar|renewable|thermal|electrical\s+systems?)\b/i.test(combined)) {
    return "Energy / Renewables / Power";
  }
  if (/\b(?:manufactur|product|machin|tooling|cnc|fabrication|industrial|process|quality|plant)\b/i.test(combined)) {
    return "Manufacturing / Automation / Product Design";
  }
  if (/\b(?:civil|construction|structural|infrastructure)\b/i.test(combined)) {
    return "Construction / Civil / Heavy Industry";
  }
  return null;
}

export function normalizeNiche(niche?: string | null, companyname?: string | null, titleText?: string | null): string {
  const raw = (niche || "").trim();
  const aliased = NICHE_ALIASES[raw] || raw;
  if (!aliased || aliased === "ZipRecruiter Intake" || aliased === "Other") {
    return inferNiche(companyname, titleText) || "Manufacturing / Automation / Product Design";
  }
  return aliased;
}

const SENIORITY_TITLE_PATTERNS = [
  /\b(?:senior|sr\.?)\b/i,
  /\bmid[-\s]?career\b|\bmid[-\s]?level\b|\bexperienced\b|\bintermediate\b/i,
  /\b(?:lead|leader|principal|staff)\b/i,
  /\b(?:manager|director|supervisor|vp|vice\s+president|chief|head)\b/i,
  /\b(?:engineer|level)(?:\s|[-,/])*(?:ii|iii|iv|v)\b|\b(?:ii|iii|iv|v)(?:\s|[-,/])*(?:engineer|level)\b/i,
  /\b(?:engineer|level)(?:\s|[-,/])*[2-9]\b|\b[2-9](?:\s|[-,/])*(?:engineer|level)\b/i,
  /\b(?:i|ii)\s*[-/]\s*(?:ii|iii|iv|v)\b/i,
];

const NON_ENGINEERING_TITLE_PATTERNS = [
  /\btechnician\b/i,
  /\boperator\b/i,
  /\bassembler\b/i,
  /\bmachinist\b/i,
  /\bmechanic\b/i,
  /\bwarehouse\b/i,
  /\bforklift\b/i,
  /\bpicker\b/i,
  /\bclerk\b/i,
  /\bcustomer\s+service\b/i,
  /\badministrative\b/i,
  /\brecruiter\b/i,
  /\b(?:inside\s+)?sales\b/i,
  /\bbusiness\s+development\b/i,
  /\bcoordinator\b/i,
  /\bscheduler\b/i,
  /\bestimator\b/i,
  /\bdrafter\b/i,
  /\barchitect\b/i,
  /\bplanner\b/i,
  /\bconsultant\b/i,
  /\binterior\s+designer\b/i,
  /\bcadd?\b/i,
];

export function isTodayExcludedNiche(niche?: string | null): boolean {
  if (!niche) return false;
  return EXCLUDED_NICHE_PATTERNS.some((pattern) => pattern.test(niche));
}

export function isCareerIngestTargetNiche(niche?: string | null): boolean {
  if (!niche || isTodayExcludedNiche(niche)) return false;
  return CAREER_INGEST_TARGET_NICHES.includes(niche as typeof CAREER_INGEST_TARGET_NICHES[number]);
}

export function isExcludedStaffingCompany(companyname?: string | null): boolean {
  if (!companyname) return false;
  return STAFFING_AGENCY_PATTERNS.some((pattern) => pattern.test(companyname));
}

export function isExcludedTodayJobTitle(title?: string | null): boolean {
  if (!title) return false;
  return SENIORITY_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

export function isNonEngineeringJobTitle(title?: string | null): boolean {
  if (!title) return false;
  return NON_ENGINEERING_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

export function isGenericJobUrl(url?: string | null): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return [
    /indeed\.com\/jobs\?/,
    /linkedin\.com\/jobs\/search/,
    /linkedin\.com\/jobs\/(?!view\/)/,
    /blueorigin\.com\/careers\/search(?:\?|$)/,
    /\/careers\/?($|[?#])/,
    /\/jobs\/?($|[?#])/,
    /\/job-search\/?($|[?#])/,
  ].some((pattern) => pattern.test(lower));
}

export function scoreTargetRole(title?: string | null, location?: string | null, bodyText?: string | null): {
  is_relevant: boolean;
  match_score: number;
  relevance_reason: string;
} {
  const t = title || "";
  const contextText = `${title || ""} ${bodyText || ""}`;
  const reasons: string[] = [];
  let score = 0;
  let hasTargetTitle = false;

  if (isExcludedTodayJobTitle(t)) {
    return { is_relevant: false, match_score: -50, relevance_reason: "excluded seniority/level title" };
  }
  if (isNonEngineeringJobTitle(t)) {
    return { is_relevant: false, match_score: -50, relevance_reason: "excluded non-engineering title" };
  }
  if (/\b(?:senior\s+level|expert\/leader)\b/i.test(contextText)) {
    return { is_relevant: false, match_score: -50, relevance_reason: "excluded seniority/level body signal" };
  }

  const boosts: Array<[RegExp, number, string]> = [
    [/\bengineer[-\s]?in[-\s]?training\b|\beit\b/i, 40, "EIT / engineer-in-training"],
    [/\bmechanical\s+engineer\s*(?:i|1)?\b/i, 34, "mechanical engineer"],
    [/\b(?:entry[-\s]?level|junior|associate|graduate|new\s+grad)\b.*\bmechanical\b/i, 34, "entry mechanical"],
    [/\bmechanical\s+design\s+engineer\b/i, 32, "mechanical design"],
    [/\b(?:hvac|mep|building\s+systems?|plumbing|piping)\b.*\b(?:engineer|designer)\b|\b(?:engineer|designer)\b.*\b(?:hvac|mep|building\s+systems?|plumbing|piping)\b/i, 32, "MEP/HVAC/building systems"],
    [/\bproject\s+engineer\s*(?:i|1)?\b/i, 28, "project engineer"],
    [/\b(?:tooling|equipment|manufacturing|process|production|quality|test|validation|environmental\s+test)\s+engineer\b/i, 24, "manufacturing/test engineer"],
    [/\b(?:electromechanical|mechatronics|robotics)\b.*\bengineer\b|\bengineer\b.*\b(?:electromechanical|mechatronics|robotics)\b/i, 26, "electromechanical/robotics"],
    [/\b(?:thermal|fea|stress|systems|controls?|optics?|optical)\s+engineer\b/i, 22, "thermal/controls/systems"],
    [/\b(?:aerospace|space|satellite|propulsion)\b.*\b(?:engineer|designer)\b|\b(?:engineer|designer)\b.*\b(?:aerospace|space|satellite|propulsion)\b/i, 22, "aerospace/space"],
    [/\b(?:civil|structural|bridge|transportation|geotechnical|geotech|environmental|water|wastewater|water\s+resources)\s+engineer\b|\bengineer[-\s]?in[-\s]?training\b.*\b(?:civil|transportation|construction|bridge|geotechnical|geotech|environmental|water|wastewater)\b/i, 22, "civil/water/geotech/infrastructure"],
    [/\b(?:electrical|power)\s+engineer\b|\bengineer\b.*\b(?:power|electrical)\b/i, 20, "electrical/power"],
  ];

  for (const [pattern, points, label] of boosts) {
    if (pattern.test(t)) {
      score += points;
      reasons.push(`+${points} ${label}`);
      hasTargetTitle = true;
      break;
    }
  }

  if (/\b(?:professional\s+engineer|p\.?e\.?|licensed\s+engineer|under\s+the\s+supervision|mentorship|fe\s+exam|abet)\b/i.test(contextText)) {
    score += 12;
    reasons.push("+12 PE path signal");
  }

  const loc = (location || "").toLowerCase();
  if (!loc) {
    score += 4;
    reasons.push("+4 unknown location");
  } else if (/\b(?:denver|lakewood|golden|boulder|littleton|englewood|arvada|aurora|broomfield|westminster|centennial|longmont|colorado|\bco\b)\b/i.test(loc)) {
    score += 16;
    reasons.push("+16 Colorado/Denver");
  } else if (loc.includes("remote")) {
    score += 4;
    reasons.push("+4 remote");
  } else {
    score -= 15;
    reasons.push("-15 outside target region");
  }

  if (!hasTargetTitle) reasons.push("no target title match");
  return {
    is_relevant: hasTargetTitle && score >= 24,
    match_score: score,
    relevance_reason: reasons.join("; "),
  };
}

export function isTodayTargetJob(job: {
  title?: string | null;
  companyname?: string | null;
  niche?: string | null;
  location?: string | null;
  is_relevant?: boolean | null;
  job_url?: string | null;
  apply_url?: string | null;
}): boolean {
  if (job.is_relevant === false) return false;
  if (isTodayExcludedNiche(job.niche)) return false;
  if (isExcludedStaffingCompany(job.companyname)) return false;
  if (isExcludedTodayJobTitle(job.title)) return false;
  if (isNonEngineeringJobTitle(job.title)) return false;
  if ("job_url" in job || "apply_url" in job) {
    const url = job.job_url || job.apply_url || "";
    if (isGenericJobUrl(url)) return false;
  }
  if (!scoreTargetRole(job.title, job.location).is_relevant) return false;
  return true;
}
