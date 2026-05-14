// Phase 7 — contact provider contracts.

export type ContactRoleType =
  | "engineering_manager"
  | "principal_eng"
  | "design_lead"
  | "recruiter"
  | "talent"
  | "other";

export type ContactSeniority =
  | "junior"
  | "mid"
  | "senior"
  | "principal"
  | "manager"
  | "director"
  | "exec"
  | null;

export type EmailConfidence = "high" | "medium" | "low" | null;

export interface NormalizedContact {
  company_id: number | null;
  company_name: string;
  full_name: string;
  title: string | null;
  email: string | null;
  email_confidence: EmailConfidence;
  linkedin_url: string | null;
  source: "rocketreach" | "manual" | "mock" | "mines_alumni" | string;
  provider_person_id: string | null;
  role_type: ContactRoleType | null;
  seniority: ContactSeniority;
  department: string | null;
  is_mines_alumni: boolean;
  is_possible_pe: boolean;
  verified_at: string | null;
  raw_payload: unknown;
}

export interface ContactSearchInput {
  company_id?: number | null;
  company_name: string;
  domain?: string | null;
  role_targets?: ContactRoleType[];
  limit?: number;
}

export interface ContactSearchResult {
  contacts: NormalizedContact[];
  errors: string[];
  warnings: string[];
}

export interface ContactProvider {
  readonly name: string;
  isConfigured(): boolean;
  search(input: ContactSearchInput): Promise<ContactSearchResult>;
}
