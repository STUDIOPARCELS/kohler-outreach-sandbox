// RocketReach contact provider. Wraps the public Person Search v2 endpoint.
// Used when ROCKETREACH_API_KEY is set; otherwise registry returns the
// mock provider.

import {
  categorizeRoleType,
  categorizeSeniority,
  detectMinesAlumni,
  detectPossiblePE,
  emailConfidenceFromGrade,
} from "./heuristics";
import type {
  ContactProvider,
  ContactSearchInput,
  ContactSearchResult,
  NormalizedContact,
} from "./types";

const API_BASE = "https://api.rocketreach.co/v2";
const NAME = "rocketreach";

const TARGETS_TO_TITLES: Record<string, string[]> = {
  engineering_manager: [
    "Mechanical Engineering Manager",
    "Engineering Manager",
    "Director of Engineering",
    "Manufacturing Engineering Manager",
    "Design Engineering Manager",
  ],
  principal_eng: ["Principal Mechanical Engineer", "Principal Engineer"],
  design_lead: ["Design Engineering Lead", "Design Lead"],
  recruiter: ["Recruiter", "Talent Acquisition", "Engineering Recruiter"],
  talent: ["Talent Acquisition Partner", "Senior Recruiter"],
  other: ["Mechanical Engineer", "Senior Mechanical Engineer"],
};

interface RocketReachPerson {
  id: number;
  name: string;
  current_title?: string | null;
  current_employer?: string | null;
  linkedin_url?: string | null;
  emails?: Array<{ email: string; type?: string | null; grade?: string | null }>;
  bio?: string | null;
  education?: Array<{ school?: string | null; degree?: string | null }>;
  skills?: string[] | null;
  status?: string;
}

function pickBestEmail(person: RocketReachPerson): {
  email: string | null;
  grade: string | null;
} {
  const emails = person.emails ?? [];
  if (emails.length === 0) return { email: null, grade: null };
  const sorted = [...emails].sort((a, b) => {
    const order = { a: 1, b: 2, c: 3, d: 4, f: 5, verified: 0 };
    const av = order[(a.grade || "").toLowerCase() as keyof typeof order] ?? 6;
    const bv = order[(b.grade || "").toLowerCase() as keyof typeof order] ?? 6;
    return av - bv;
  });
  return { email: sorted[0].email, grade: sorted[0].grade ?? null };
}

function normalize(person: RocketReachPerson, input: ContactSearchInput): NormalizedContact {
  const { email, grade } = pickBestEmail(person);
  return {
    company_id: input.company_id ?? null,
    company_name: input.company_name,
    full_name: person.name,
    title: person.current_title ?? null,
    email,
    email_confidence: emailConfidenceFromGrade(grade),
    linkedin_url: person.linkedin_url ?? null,
    source: NAME,
    provider_person_id: String(person.id),
    role_type: categorizeRoleType(person.current_title),
    seniority: categorizeSeniority(person.current_title),
    department: null,
    is_mines_alumni: detectMinesAlumni({
      bio: person.bio,
      education: person.education ?? null,
      skills: person.skills ?? null,
    }),
    is_possible_pe: detectPossiblePE({ title: person.current_title, bio: person.bio }),
    verified_at: null,
    raw_payload: person,
  };
}

export const rocketReachProvider: ContactProvider = {
  name: NAME,
  isConfigured() {
    return !!process.env.ROCKETREACH_API_KEY;
  },
  async search(input: ContactSearchInput): Promise<ContactSearchResult> {
    const apiKey = process.env.ROCKETREACH_API_KEY;
    if (!apiKey) {
      return {
        contacts: [],
        errors: ["ROCKETREACH_API_KEY not set"],
        warnings: [],
      };
    }

    const targets = input.role_targets ?? ["engineering_manager", "recruiter"];
    const titles = Array.from(
      new Set(
        targets.flatMap((t) => TARGETS_TO_TITLES[t] ?? [])
      )
    );

    const body = {
      query: {
        current_employer: [input.company_name],
        current_title: titles,
      },
      page_size: input.limit ?? 10,
    };

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return { contacts: [], errors: [`network error: ${(err as Error).message}`], warnings: [] };
    }

    if (!response.ok) {
      return {
        contacts: [],
        errors: [`rocketreach search ${response.status}`],
        warnings: [],
      };
    }

    const json = (await response.json()) as { profiles?: RocketReachPerson[] };
    const profiles = json.profiles ?? [];

    return {
      contacts: profiles.map((person) => normalize(person, input)),
      errors: [],
      warnings: [],
    };
  },
};
