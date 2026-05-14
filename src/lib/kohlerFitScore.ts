// Phase 5 — Kohler-specific fit scoring.
//
// `scoreJobForKohler(job, profile)` returns sub-scores plus a recommended
// action and an explanation_json that the UI can render verbatim. The pure
// scoring logic is exported so callers can score in-memory rows (e.g. on
// the Open Roles page) without writing to `role_fit_scores`.

// Bump on every algorithm change. Old rows are preserved as historical
// record (UNIQUE on (job_listing_id, score_version) keeps them safe).
// v1: original Phase 5 algorithm (273 rows in production from 2026-05-14).
// v2: same algorithm, ships via the rescore route; lays groundwork for
//     future tuning passes (v3, v4) without touching v1 history.
export const SCORE_VERSION = "kohler-fit-v2";

export type RecommendedAction =
  | "apply_now"
  | "email_engineering_manager"
  | "email_recruiter"
  | "alumni_outreach"
  | "pe_track_outreach"
  | "physical_letter"
  | "monitor"
  | "skip";

export interface CandidateProfile {
  id?: number;
  /** EIT-track / PE-path candidate. */
  pe_track?: boolean;
  /** Mines alumnus. */
  is_mines_alumni?: boolean;
  /** Years of professional experience. */
  years_experience?: number;
  /** Free-text skills and tools the candidate emphasizes. */
  skills?: string[];
  /** ZIP for distance-based scoring; defaults to 80226 (Lakewood, CO). */
  home_zip?: string;
}

export interface JobInputForScoring {
  title?: string | null;
  body_text?: string | null;
  description?: string | null;
  location?: string | null;
  niche?: string | null;
  company_name?: string | null;
  match_score?: number | null;
  is_relevant?: boolean | null;
  match_reason?: string | null;
}

export interface RoleFitScore {
  skill_fit_score: number;
  entry_level_score: number;
  pe_track_score: number;
  niche_score: number;
  location_score: number;
  mines_signal_score: number;
  overall_score: number;
  recommended_action: RecommendedAction;
  explanation_json: {
    matched_skills: string[];
    pe_signals: string[];
    location_band: string | null;
    niche_match: string | null;
    seniority_flag: "junior_friendly" | "senior_only" | "ambiguous";
    notes: string[];
  };
}

const DEFAULT_PROFILE: Required<CandidateProfile> = {
  id: 1,
  pe_track: true,
  is_mines_alumni: true,
  years_experience: 0,
  home_zip: "80226",
  skills: [
    "mechanical design",
    "solidworks",
    "fea",
    "cfd",
    "heat transfer",
    "cnc",
    "fabrication",
    "mig welding",
    "3d printing",
    "dfm",
    "dfa",
    "fmea",
    "python",
    "matlab",
    "c++",
    "prototyping",
    "manufacturing engineering",
    "test engineering",
    "aerospace",
    "defense",
    "advanced manufacturing",
    "robotics",
    "acoustics",
    "audio",
    "precision fabrication",
    "architectural fabrication",
    "millwork",
  ],
};

const PE_SIGNALS = [
  "engineer in training",
  "engineer-in-training",
  "eit",
  "professional engineer",
  " p.e. ",
  " pe ",
  "fe exam",
  "abet",
  "licensed engineer",
  "stamp drawing",
  "stamped drawing",
  "supervision of a pe",
  "under the supervision",
  "design calculation",
  "consulting engineering",
  "mep",
  "civil",
  "geotechnical",
  "water resources",
  "environmental engineer",
  "forensic engineer",
  "field engineer",
];

const TARGET_NICHES_HOT = new Set([
  "MEP / HVAC / Building Systems",
  "Aerospace / Space",
  "Manufacturing / Automation / Product Design",
  "Government / Public Works / Infrastructure",
  "Water / Environmental / Geotech",
  "Quantum / Deep Tech / Electronics / Robotics",
  "Energy / Renewables / Power",
]);

const TARGET_NICHES_WARM = new Set([
  "Construction / Civil / Heavy Industry",
  "Metals / Material Science",
  "Medical / Biotech",
  "Automotive / Vehicles",
]);

const COLORADO_RE =
  /\b(?:denver|lakewood|golden|boulder|littleton|englewood|arvada|aurora|broomfield|westminster|centennial|longmont|loveland|fort\s+collins|colorado\s+springs|colorado|\bco\b)\b/i;

const SENIOR_RE =
  /\b(?:senior|sr\.?|principal|staff|lead\s+engineer|director|head\s+of|chief\s+engineer|vp|vice\s+president|level\s*[3-9]|ii{2,}|i{4,})\b/i;
const JUNIOR_RE =
  /\b(?:entry[-\s]?level|new\s+grad|graduate|associate|junior|jr\.?|engineer\s*(?:i|1)\b|level\s*[12]|college\s+grad)\b/i;
const MANAGER_RE =
  /\b(?:manager|supervisor|team\s+lead)\b/i;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function corpus(job: JobInputForScoring): string {
  return [
    job.title ?? "",
    job.body_text ?? "",
    job.description ?? "",
  ]
    .join(" \n ")
    .toLowerCase();
}

function escapeRegex(s: string): string {
  // Standard regex-metacharacter escape. Earlier implementation had a
  // malformed character class that crashed on "c++" → "/\bc++\b/" is
  // invalid because + is unescaped.
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchedSkills(skills: string[], text: string): string[] {
  const found: string[] = [];
  for (const skill of skills) {
    const needle = skill.toLowerCase().trim();
    if (!needle) continue;
    const escaped = escapeRegex(needle);
    // \b only sits between a word char and a non-word char, so skills
    // that begin/end with non-word characters (c++, .net, etc.) need
    // lookarounds against word chars instead of \b.
    const startsWithWord = /^[\w]/.test(needle);
    const endsWithWord = /[\w]$/.test(needle);
    const prefix = startsWithWord ? "\\b" : "(?<![\\w])";
    const suffix = endsWithWord ? "\\b" : "(?![\\w])";
    try {
      const re = new RegExp(`${prefix}${escaped}${suffix}`, "i");
      if (re.test(text)) found.push(skill);
    } catch {
      // Any pattern that still won't compile gets silently skipped —
      // skill match is best-effort, not a correctness requirement.
    }
  }
  return found;
}

function detectPeSignals(text: string): string[] {
  const found: string[] = [];
  for (const signal of PE_SIGNALS) {
    if (text.includes(signal)) found.push(signal.trim());
  }
  return found;
}

function locationBand(location: string | null | undefined): {
  score: number;
  band: string | null;
} {
  if (!location) return { score: 4, band: "unknown" };
  const loc = location.toLowerCase();
  if (COLORADO_RE.test(loc)) return { score: 18, band: "colorado_or_denver" };
  if (loc.includes("remote")) return { score: 8, band: "remote" };
  if (/\b(?:utah|wyoming|nebraska|kansas|new\s+mexico|arizona)\b/.test(loc)) {
    return { score: 4, band: "neighbor_state" };
  }
  return { score: -8, band: "out_of_region" };
}

function nicheBand(niche: string | null | undefined): {
  score: number;
  match: string | null;
} {
  if (!niche) return { score: 0, match: null };
  if (TARGET_NICHES_HOT.has(niche)) return { score: 16, match: "hot" };
  if (TARGET_NICHES_WARM.has(niche)) return { score: 8, match: "warm" };
  return { score: 0, match: "other" };
}

function seniorityFlag(text: string, title: string): "junior_friendly" | "senior_only" | "ambiguous" {
  const both = `${title} \n ${text}`;
  if (JUNIOR_RE.test(both)) return "junior_friendly";
  if (SENIOR_RE.test(both)) return "senior_only";
  return "ambiguous";
}

function recommendAction(args: {
  overall: number;
  pe: number;
  niche: number;
  isMines: boolean;
  hasMatchedSkills: boolean;
  seniority: "junior_friendly" | "senior_only" | "ambiguous";
  hasJobUrl: boolean;
}): RecommendedAction {
  if (args.seniority === "senior_only" && args.overall < 60) return "skip";
  if (args.overall >= 80 && args.seniority !== "senior_only") return "apply_now";
  if (args.pe >= 12 && args.niche >= 8) return "pe_track_outreach";
  if (args.isMines && args.overall >= 40) return "alumni_outreach";
  if (args.overall >= 55 && args.hasJobUrl) return "email_engineering_manager";
  if (args.overall >= 40) return "email_recruiter";
  if (args.overall >= 25) return "physical_letter";
  if (args.overall >= 0) return "monitor";
  return "skip";
}

export function scoreJobForKohler(
  job: JobInputForScoring & { job_url?: string | null; apply_url?: string | null },
  profile?: CandidateProfile
): RoleFitScore {
  const merged: Required<CandidateProfile> = {
    ...DEFAULT_PROFILE,
    ...profile,
    skills: profile?.skills && profile.skills.length > 0 ? profile.skills : DEFAULT_PROFILE.skills,
  };
  const text = corpus(job);
  const titleLower = (job.title ?? "").toLowerCase();
  const notes: string[] = [];

  // Skill fit (0-30): proportional to how many of the candidate's skills appear.
  const matched = matchedSkills(merged.skills, text);
  const skillFit = clamp(Math.round(matched.length * 3.5), 0, 30);
  if (matched.length > 0) notes.push(`matched ${matched.length} skill keywords`);

  // Entry-level fit (0-20): junior_friendly +20, ambiguous +10, senior_only 0.
  const seniority = seniorityFlag(text, titleLower);
  const entryLevel = seniority === "junior_friendly" ? 20 : seniority === "ambiguous" ? 10 : 0;
  if (entryLevel === 0) notes.push("posting reads senior-only");
  if (MANAGER_RE.test(titleLower)) notes.push("management title");

  // PE-track (0-20): scaled by # of PE signals.
  const peSignals = detectPeSignals(text);
  const peTrack = clamp(peSignals.length * 5, 0, 20);

  // Niche (0-16).
  const nicheRes = nicheBand(job.niche);
  const nicheScore = nicheRes.score;
  if (nicheRes.match) notes.push(`niche ${nicheRes.match}`);

  // Location (-8..18).
  const locRes = locationBand(job.location);
  const locationScore = locRes.score;

  // Mines signal — small additive nudge when the candidate is Mines and the
  // job text mentions Mines or Colorado School of Mines. Caps at 8.
  const minesSignal = merged.is_mines_alumni && /\b(?:colorado\s+school\s+of\s+mines|mines\s+grad|csm\s+grad)\b/i.test(text)
    ? 8
    : merged.is_mines_alumni
      ? 2
      : 0;

  // Overall: weighted sum, capped 0-100.
  const overall = clamp(
    skillFit + entryLevel + peTrack + nicheScore + locationScore + minesSignal,
    0,
    100
  );

  const recommended_action = recommendAction({
    overall,
    pe: peTrack,
    niche: nicheScore,
    isMines: !!merged.is_mines_alumni,
    hasMatchedSkills: matched.length > 0,
    seniority,
    hasJobUrl: !!(job.apply_url || job.job_url),
  });

  return {
    skill_fit_score: skillFit,
    entry_level_score: entryLevel,
    pe_track_score: peTrack,
    niche_score: nicheScore,
    location_score: locationScore,
    mines_signal_score: minesSignal,
    overall_score: overall,
    recommended_action,
    explanation_json: {
      matched_skills: matched,
      pe_signals: peSignals,
      location_band: locRes.band,
      niche_match: nicheRes.match,
      seniority_flag: seniority,
      notes,
    },
  };
}
