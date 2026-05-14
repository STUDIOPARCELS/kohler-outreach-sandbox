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
  name: string;
  location: string;
  portfolioUrl: string;
  credentials: string[];
  skills: string[];
  niches: string[];
}

export interface JobFitInput {
  title?: string | null;
  companyname?: string | null;
  location?: string | null;
  description?: string | null;
  source?: string | null;
  relevance_reason?: string | null;
  match_score?: number | null;
  is_relevant?: boolean | null;
  contact_count?: number | null;
  email_count?: number | null;
  is_mines_alumni?: boolean | null;
}

export interface KohlerFitScore {
  skill_fit_score: number;
  entry_level_score: number;
  pe_track_score: number;
  niche_score: number;
  location_score: number;
  mines_signal_score: number;
  overall_score: number;
  recommended_action: RecommendedAction;
  explanation_summary: string;
  explanation_json: {
    matched_skills: string[];
    entry_level_signals: string[];
    pe_track_signals: string[];
    niche_signals: string[];
    location_signals: string[];
    mines_signals: string[];
    risk_signals: string[];
  };
}

export const defaultKohlerCandidateProfile: CandidateProfile = {
  name: "Kohler Wood",
  location: "Lakewood, Colorado",
  portfolioUrl: "https://kohler.solokit.app",
  credentials: ["BSME", "EIT", "Colorado School of Mines"],
  skills: [
    "mechanical design",
    "SolidWorks",
    "FEA",
    "CFD",
    "heat transfer",
    "CNC",
    "fabrication",
    "MIG welding",
    "3D printing",
    "DFM",
    "DFA",
    "FMEA",
    "Python",
    "MATLAB",
    "C++",
    "prototyping",
    "manufacturing engineering",
    "test engineering",
  ],
  niches: [
    "aerospace",
    "defense",
    "advanced manufacturing",
    "robotics",
    "acoustics",
    "precision fabrication",
    "architectural fabrication",
    "MEP",
    "water",
    "environmental",
    "geotechnical",
  ],
};

const SKILL_PATTERNS: Array<[RegExp, string, number]> = [
  [/\bmechanical\s+engineer(?:ing)?\b/i, "mechanical engineering role", 18],
  [/\bmechanical\s+design\b/i, "mechanical design", 18],
  [/\bdesign\s+engineer(?:ing)?\b/i, "design engineering", 14],
  [/\bsolidworks\b|\bsolid\s+works\b/i, "SolidWorks", 16],
  [/\bfea\b|\bfinite\s+element\b|\bstress\s+analysis\b/i, "FEA/stress analysis", 14],
  [/\bcfd\b|\bheat\s+transfer\b|\bthermal\b/i, "CFD/heat transfer/thermal", 12],
  [/\bcnc\b|\bmachin(?:ing|ist)\b/i, "CNC/machining", 10],
  [/\bfabricat(?:e|ion)\b|\bweld(?:ing)?\b|\bmig\b/i, "fabrication/welding", 12],
  [/\b3d\s+print(?:ing)?\b|\badditive\s+manufacturing\b/i, "3D printing/additive manufacturing", 10],
  [/\bdfm\b|\bdfa\b|\bfmea\b|\bgd&t\b/i, "DFM/DFA/FMEA/GD&T", 12],
  [/\bpython\b|\bmatlab\b|\bc\+\+\b/i, "Python/MATLAB/C++", 10],
  [/\bprototype|prototyping\b/i, "prototyping", 10],
  [/\bmanufacturing\s+engineer(?:ing)?\b|\btest\s+engineer(?:ing)?\b/i, "manufacturing/test engineering", 12],
];

const ENTRY_PATTERNS: Array<[RegExp, string, number]> = [
  [/\bentry[-\s]?level\b|\bnew\s+grad\b|\bgraduate\b/i, "entry-level/new grad", 28],
  [/\bengineer\s*(?:i|1)\b|\bmechanical\s+engineer\s*(?:i|1)\b/i, "Engineer I", 24],
  [/\bassociate\s+engineer\b|\bjunior\s+engineer\b/i, "associate/junior engineer", 22],
  [/\b0\s*[-–]\s*3\s+years?\b|\b1\s*[-–]\s*3\s+years?\b|\b0\s*[-–]\s*2\s+years?\b/i, "0-3 years", 18],
  [/\beit\b|\bengineer[-\s]?in[-\s]?training\b/i, "EIT accepted", 20],
];

const PE_TRACK_PATTERNS: Array<[RegExp, string, number]> = [
  [/\beit\b|\bengineer[-\s]?in[-\s]?training\b/i, "EIT / Engineer-in-Training", 22],
  [/\bprofessional\s+engineer\b|\bp\.?\s*e\.?\b|\blicensed\s+engineer\b/i, "PE/licensed engineer signal", 18],
  [/\bunder\s+(?:the\s+)?supervision\b|\bmentorship\b|\bmentor(?:ed|ship)?\b/i, "supervised engineering path", 14],
  [/\bdesign\s+calculations?\b|\bstamped\s+drawings?\b|\bseal(?:ed)?\s+drawings?\b/i, "design calculations/stamped drawings", 18],
  [/\bconsulting\s+engineering\b|\bmep\b|\bhvac\b|\bplumbing\b|\bpiping\b/i, "consulting/MEP", 16],
  [/\bcivil\b|\bgeotechnical\b|\bwater\b|\bwastewater\b|\benvironmental\b|\bforensic\b|\bfield\s+engineering\b/i, "civil/water/geotech/field engineering", 14],
];

const NICHE_PATTERNS: Array<[RegExp, string, number]> = [
  [/\baerospace\b|\bdefen[sc]e\b|\bspace\b|\bsatellite\b|\bpropulsion\b/i, "aerospace/defense", 18],
  [/\badvanced\s+manufacturing\b|\bmanufacturing\b|\bautomation\b|\brobotics?\b|\bmechatronics\b/i, "advanced manufacturing/robotics", 18],
  [/\bacoustics?\b|\baudio\b/i, "acoustics/audio", 14],
  [/\bprecision\s+fabrication\b|\bfabrication\b|\bmillwork\b|\barchitectural\b/i, "precision/architectural fabrication", 12],
  [/\bwater\b|\bwastewater\b|\benvironmental\b|\bgeotech(?:nical)?\b/i, "water/environmental/geotech", 14],
  [/\bmep\b|\bhvac\b|\bbuilding\s+systems?\b/i, "MEP/HVAC/building systems", 16],
];

const RISK_PATTERNS: Array<[RegExp, string, number]> = [
  [/\bsenior\b|\bsr\.?\b|\bprincipal\b|\bstaff\b|\blead\b/i, "senior-level title", -25],
  [/\bmanager\b|\bdirector\b|\bvp\b|\bchief\b/i, "management title", -30],
  [/\btechnician\b|\boperator\b|\bassembler\b|\bwarehouse\b|\bsales\b|\brecruiter\b/i, "non-target role family", -35],
  [/\b5\+?\s+years?\b|\b7\+?\s+years?\b|\b10\+?\s+years?\b/i, "high experience requirement", -18],
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniquePush(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function scoreSignals(text: string, patterns: Array<[RegExp, string, number]>): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;
  for (const [pattern, label, points] of patterns) {
    if (pattern.test(text)) {
      score += points;
      uniquePush(signals, label);
    }
  }
  return { score: clamp(score), signals };
}

function scoreRiskSignals(text: string): { score: number; signals: string[] } {
  const signals: string[] = [];
  let penalty = 0;
  for (const [pattern, label, points] of RISK_PATTERNS) {
    if (pattern.test(text)) {
      penalty += Math.abs(points);
      uniquePush(signals, label);
    }
  }
  return { score: clamp(penalty), signals };
}

function scoreLocation(location?: string | null): { score: number; signals: string[] } {
  const loc = (location || "").toLowerCase();
  if (!loc) return { score: 55, signals: ["location not listed"] };
  if (/\bdenver\b|\blakewood\b|\bgolden\b|\bboulder\b|\barvada\b|\bfront\s+range\b|\bcolorado\b|\bco\b/.test(loc)) {
    return { score: 100, signals: ["Denver/Front Range/Colorado"] };
  }
  if (/\bremote\b|\bhybrid\b/.test(loc)) return { score: 70, signals: ["remote/hybrid"] };
  return { score: 25, signals: ["outside target region"] };
}

function scoreMines(text: string, isMinesAlumni?: boolean | null): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;
  if (isMinesAlumni) {
    score += 80;
    signals.push("selected contact is Mines alumni");
  }
  if (/\bcolorado\s+school\s+of\s+mines\b|\bmines\s+alum(?:ni|nus|na)?\b/i.test(text)) {
    score += 45;
    signals.push("Mines signal in job/company context");
  }
  return { score: clamp(score), signals };
}

function recommendedAction(input: {
  overall: number;
  peTrack: number;
  mines: number;
  emailCount: number;
  contactCount: number;
  isRelevant?: boolean | null;
  source?: string | null;
}): RecommendedAction {
  if (input.overall < 25) return "skip";
  if (input.overall < 35 && input.isRelevant) return "monitor";
  if (input.overall < 35) return "skip";
  if (input.peTrack >= 60 && input.contactCount > 0) return "pe_track_outreach";
  if (input.mines >= 45) return "alumni_outreach";
  if (input.emailCount > 0) return "email_engineering_manager";
  if (input.contactCount > 0) return "email_recruiter";
  if (input.source?.includes("government")) return "apply_now";
  if (input.overall >= 70) return "apply_now";
  if (input.overall >= 50) return "physical_letter";
  return "monitor";
}

export function scoreJobForKohler(job: JobFitInput): KohlerFitScore {
  const text = [
    job.title,
    job.companyname,
    job.location,
    job.description,
    job.relevance_reason,
  ].filter(Boolean).join(" ");

  const skills = scoreSignals(text, SKILL_PATTERNS);
  const entry = scoreSignals(text, ENTRY_PATTERNS);
  const peTrack = scoreSignals(text, PE_TRACK_PATTERNS);
  const niche = scoreSignals(text, NICHE_PATTERNS);
  const location = scoreLocation(job.location);
  const mines = scoreMines(text, job.is_mines_alumni);
  const risks = scoreRiskSignals(text);

  const priorMatch = Math.max(0, Math.min(100, Number(job.match_score || 0) * 1.5));
  const relevanceBoost = job.is_relevant ? 10 : 0;
  const positive =
    skills.score * 0.25 +
    entry.score * 0.16 +
    peTrack.score * 0.20 +
    niche.score * 0.16 +
    location.score * 0.13 +
    mines.score * 0.05 +
    priorMatch * 0.10 +
    relevanceBoost;
  const strongFitBonus =
    (peTrack.score >= 60 ? 8 : 0) +
    (entry.score >= 40 ? 6 : 0) +
    (location.score >= 90 ? 4 : 0) +
    (skills.score >= 15 ? 4 : 0);
  const overall = clamp(positive + strongFitBonus - risks.score * 0.35);
  const action = recommendedAction({
    overall,
    peTrack: peTrack.score,
    mines: mines.score,
    emailCount: Number(job.email_count || 0),
    contactCount: Number(job.contact_count || 0),
    isRelevant: job.is_relevant,
    source: job.source,
  });

  const topReasons = [
    ...skills.signals.slice(0, 2),
    ...peTrack.signals.slice(0, 2),
    ...entry.signals.slice(0, 1),
    ...niche.signals.slice(0, 1),
    ...location.signals.slice(0, 1),
  ].slice(0, 4);

  return {
    skill_fit_score: skills.score,
    entry_level_score: entry.score,
    pe_track_score: peTrack.score,
    niche_score: niche.score,
    location_score: location.score,
    mines_signal_score: mines.score,
    overall_score: overall,
    recommended_action: action,
    explanation_summary: topReasons.length > 0 ? topReasons.join("; ") : "limited explicit fit evidence",
    explanation_json: {
      matched_skills: skills.signals,
      entry_level_signals: entry.signals,
      pe_track_signals: peTrack.signals,
      niche_signals: niche.signals,
      location_signals: location.signals,
      mines_signals: mines.signals,
      risk_signals: risks.signals,
    },
  };
}
