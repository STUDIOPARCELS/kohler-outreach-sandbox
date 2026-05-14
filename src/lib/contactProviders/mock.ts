// Mock contact provider for environments without RocketReach credentials.
// Returns a deterministic set of contacts so Phase 8 templates and the
// command-center page have something to render in tests.

import {
  categorizeRoleType,
  categorizeSeniority,
} from "./heuristics";
import type {
  ContactProvider,
  ContactSearchInput,
  ContactSearchResult,
  NormalizedContact,
} from "./types";

const NAME = "mock";

function buildEmail(name: string, domain: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = (parts[0] || "first").toLowerCase();
  const last = (parts[parts.length - 1] || "last").toLowerCase();
  return `${first}.${last}@${domain}`;
}

function defaultDomain(companyName: string): string {
  return `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;
}

const SEED_PEOPLE: Array<{ name: string; title: string; mines: boolean; pe: boolean }> = [
  { name: "Avery Ramirez", title: "Engineering Manager", mines: true, pe: false },
  { name: "Jordan Patel", title: "Director of Engineering", mines: false, pe: true },
  { name: "Casey Liu", title: "Principal Mechanical Engineer", mines: false, pe: true },
  { name: "Morgan Brooks", title: "Recruiter", mines: false, pe: false },
];

export const mockContactProvider: ContactProvider = {
  name: NAME,
  isConfigured() {
    return true;
  },
  async search(input: ContactSearchInput): Promise<ContactSearchResult> {
    const domain = input.domain ?? defaultDomain(input.company_name);
    const limit = input.limit ?? SEED_PEOPLE.length;
    const contacts: NormalizedContact[] = SEED_PEOPLE.slice(0, limit).map(
      (person, idx) => ({
        company_id: input.company_id ?? null,
        company_name: input.company_name,
        full_name: person.name,
        title: person.title,
        email: buildEmail(person.name, domain),
        email_confidence: idx === 0 ? "high" : idx === 1 ? "medium" : "low",
        linkedin_url: null,
        source: NAME,
        provider_person_id: `mock-${idx + 1}`,
        role_type: categorizeRoleType(person.title),
        seniority: categorizeSeniority(person.title),
        department: null,
        is_mines_alumni: person.mines,
        is_possible_pe: person.pe,
        verified_at: null,
        raw_payload: { mock: true },
      })
    );
    return { contacts, errors: [], warnings: ["mock contact provider"] };
  },
};
