# Architecture — Kohler Outreach Engine

> Living architecture doc. Updated as each phase introduces new components.

## Mental model

```
Company targets
  → job sources (adapters)
    → job_listings (with provenance)
      → role_fit_scores (Kohler-specific)
        → contacts (RocketReach + Mines + PE signals)
          → outreach_actions (campaigns, drafts, applications, letters)
            → Gmail send/draft
              → email_threads / email_messages (replies, classification)
                → metrics dashboard
                  → next best action
```

The sandbox is the source of truth. Production is a downstream release target.

## Modules (today)

- **`src/lib/supabaseAdmin.ts`** — single shared service-role client.
- **`src/lib/auth.ts`** — three guards: app-origin, API-secret, cron-secret.
- **`src/lib/googleAuth.ts`** — Gmail OAuth2 client + token refresh.
- **`src/lib/targeting.ts`** — niche taxonomy, exclusions, target-role
  scoring, today-target predicate.
- **`src/lib/outreachScore.ts`** — company-level outreach score
  (Lakewood ZIP distance + niche + contact + Mines alumni).
- **`src/lib/jobLinks.ts`** — apply-URL cleaning heuristics.

## Modules (planned, by phase)

| Module | Phase | Purpose |
| --- | --- | --- |
| `src/lib/runtimeEnvironment.ts` | 2 | `getRuntimeEnvironment()` returns `{environment, supabaseHost, parserVersion, vercelEnv, appEnv}`. |
| `src/app/api/runtime-diagnostics/route.ts` | 2 | Server route returning current sync run, latest job count, last successful ingest, Gmail cursor status. |
| `src/components/EnvironmentBadge.tsx` | 2 | Sticky badge in Nav showing `sandbox` / `preview` / `production`. |
| `supabase/migrations/0001_provenance.sql` | 3 | Adds `job_sources`, `sync_runs`, plus provenance columns to `job_listings`. |
| `src/lib/jobSources/` | 4 | Adapter interface + per-source implementations (gmail-zr, careers, manual, greenhouse, lever, ashby). |
| `src/lib/kohlerFitScore.ts` | 5 | Pure scoring fn returning sub-scores + recommended action + explanation JSON. |
| `supabase/migrations/0002_role_fit_scores.sql` | 5 | `role_fit_scores` and `candidate_profile` (if not already present). |
| `src/lib/contactProviders/` | 7 | RocketReach adapter + mock provider; Mines / PE detection helpers. |
| `supabase/migrations/0003_contacts_enrichment.sql` | 7 | Additive columns on `contacts` (`role_type`, `seniority`, `is_mines_alumni`, …). |
| `src/lib/outreach/templates.ts` | 8 | Six template renderers (active-job EM, recruiter, intro, Mines, PE, letter). |
| `supabase/migrations/0004_outreach_workflow.sql` | 8 | `outreach_campaigns`, `outreach_actions`, `email_drafts`, `applications`, `letters`. |
| `src/lib/gmail/draft.ts` | 9 | Gmail draft creation + ENABLE_LIVE_SEND gate. |
| `src/lib/gmail/replies.ts` | 9 | Reply backfill, classification, thread linking. |
| `supabase/migrations/0005_email_messages.sql` | 9 | `sent_messages`, `email_threads`, `email_messages`. |
| `src/app/dashboard/page.tsx` | 10 | Metrics command center. |

## Data contracts

### NormalizedJob (Phase 4)
```ts
type NormalizedJob = {
  source_type: "ziprecruiter_email" | "careers" | "manual" | "greenhouse" | "lever" | "ashby" | "usajobs" | string;
  source_url: string | null;
  external_job_id: string | null;
  title: string;
  company_name: string;
  company_id?: string | number | null;
  location: string | null;
  apply_url: string | null;
  salary: string | null;
  body_text: string | null;
  posted_at: string | null;
  parser_version: string;
  raw_payload: unknown;
};
```

### RoleFitScore (Phase 5)
```ts
type RoleFitScore = {
  job_id: number;
  candidate_profile_id: number;
  skill_fit_score: number;
  entry_level_score: number;
  pe_track_score: number;
  niche_score: number;
  location_score: number;
  mines_signal_score: number;
  overall_score: number;
  recommended_action:
    | "apply_now"
    | "email_engineering_manager"
    | "email_recruiter"
    | "alumni_outreach"
    | "pe_track_outreach"
    | "physical_letter"
    | "monitor"
    | "skip";
  explanation_json: Record<string, unknown>;
};
```

### NormalizedContact (Phase 7)
```ts
type NormalizedContact = {
  company_id: number | null;
  full_name: string;
  title: string | null;
  email: string | null;
  email_confidence: "high" | "medium" | "low" | null;
  linkedin_url: string | null;
  source: "rocketreach" | "manual" | "mines_alumni" | string;
  provider_person_id: string | null;
  role_type: "engineering_manager" | "recruiter" | "principal_eng" | "design_lead" | "other" | null;
  seniority: "junior" | "mid" | "senior" | "principal" | "manager" | "director" | "exec" | null;
  department: string | null;
  is_mines_alumni: boolean;
  is_possible_pe: boolean;
  verified_at: string | null;
};
```

### ReplyClassification (Phase 9)
```ts
type ReplyClassification =
  | "positive_reply"
  | "recruiter_screen"
  | "apply_online"
  | "referral"
  | "needs_follow_up"
  | "rejection"
  | "bounce"
  | "out_of_office"
  | "auto_reply"
  | "unknown";
```

## External providers

Each provider is wrapped in an adapter interface so a mock can stand in when
credentials are absent.

| Provider | Adapter | Phase | Mock fallback |
| --- | --- | --- | --- |
| Supabase | `supabaseAdmin` | existing | n/a (fail loudly if missing) |
| Gmail (read) | `gmail/replies.ts` | 9 | mock thread store |
| Gmail (write) | `gmail/draft.ts` | 9 | dry-run that returns mock draft |
| RocketReach | `contactProviders/rocketreach.ts` | 7 | mock provider returns deterministic seeds |
| Greenhouse / Lever / Ashby | `jobSources/` | 4 | placeholder shells with documented endpoints |
| USAJOBS | `jobSources/usajobs.ts` | 4 | already optional in `ingest/careers` |

## Safety posture

- All write paths require either `requireAppOrigin` (browser) or
  `requireApiSecret`/`requireCronSecret` (machine).
- Gmail send is gated behind `ENABLE_LIVE_SEND === "true"` AND a draft row
  with `status === "human_approved"`. Default behavior creates Gmail drafts.
- Migrations are additive; no DROP/RENAME of existing columns.
- Raw provider payloads are kept server-side; only normalized fields surface
  in the UI.

This doc is updated incrementally as each phase ships.
