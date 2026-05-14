// Pure helpers for classifying contacts. Used by every provider so the
// resulting NormalizedContact rows are consistent.

import type {
  ContactRoleType,
  ContactSeniority,
} from "./types";

const ROLE_PATTERNS: Array<[RegExp, ContactRoleType]> = [
  [/recruit(er|ing)|talent\s+acquisition|sourcer/i, "recruiter"],
  [/talent\b/i, "talent"],
  [/(?:engineering|manufacturing|design|mech|hardware|systems)\s+(?:manager|mgr)\b/i, "engineering_manager"],
  [/\bdirector\s+of\s+engineering|head\s+of\s+engineering|vp\s+engineering\b/i, "engineering_manager"],
  [/principal\s+engineer|principal\s+(?:mech|mechanical)\s+engineer/i, "principal_eng"],
  [/\bdesign\s+(?:lead|principal)\b/i, "design_lead"],
];

const SENIORITY_PATTERNS: Array<[RegExp, Exclude<ContactSeniority, null>]> = [
  [/\b(?:cto|ceo|cfo|vp|vice\s+president|chief)\b/i, "exec"],
  [/\bdirector\b/i, "director"],
  [/\b(?:manager|mgr)\b/i, "manager"],
  [/\bprincipal\b/i, "principal"],
  [/\bsenior\b|\bsr\.?\b|\bstaff\b/i, "senior"],
  [/\bjunior\b|\bjr\.?\b|\bassociate\b|\bentry[-\s]?level\b/i, "junior"],
];

export function categorizeRoleType(title: string | null | undefined): ContactRoleType | null {
  if (!title) return null;
  for (const [re, type] of ROLE_PATTERNS) if (re.test(title)) return type;
  return "other";
}

export function categorizeSeniority(title: string | null | undefined): ContactSeniority {
  if (!title) return null;
  for (const [re, level] of SENIORITY_PATTERNS) if (re.test(title)) return level;
  return "mid";
}

export function detectMinesAlumni(opts: {
  bio?: string | null;
  education?: Array<{ school?: string | null }> | null;
  skills?: string[] | null;
}): boolean {
  const bio = (opts.bio || "").toLowerCase();
  if (/colorado\s+school\s+of\s+mines\b|csm\s+(?:grad|alum)\b|\bmines\s+(?:grad|alum)\b/.test(bio)) {
    return true;
  }
  for (const edu of opts.education ?? []) {
    if (edu.school && /colorado\s+school\s+of\s+mines/i.test(edu.school)) return true;
  }
  for (const skill of opts.skills ?? []) {
    if (/colorado\s+school\s+of\s+mines/i.test(skill)) return true;
  }
  return false;
}

const PE_TITLE_RE = /(?:,\s*p\.?e\.?\b|professional\s+engineer\b|\beit\b|engineer\s+in\s+training\b|licensed\s+engineer\b)/i;

export function detectPossiblePE(opts: {
  title?: string | null;
  bio?: string | null;
}): boolean {
  if (opts.title && PE_TITLE_RE.test(opts.title)) return true;
  if (opts.bio && PE_TITLE_RE.test(opts.bio)) return true;
  return false;
}

export function emailConfidenceFromGrade(grade: string | null | undefined): "high" | "medium" | "low" | null {
  if (!grade) return null;
  const g = grade.toLowerCase();
  if (g === "a" || g === "verified") return "high";
  if (g === "b") return "medium";
  if (g === "c" || g === "d") return "low";
  return null;
}

export function emailConfidenceFromValidation(validation: string | null | undefined): "high" | "medium" | "low" | null {
  if (!validation) return null;
  const v = validation.toLowerCase();
  if (v === "valid" || v === "verified") return "high";
  if (v === "risky" || v === "accept_all") return "medium";
  if (v === "invalid" || v === "unknown") return "low";
  return null;
}
