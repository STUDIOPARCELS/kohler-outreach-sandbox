# Verification Report — Kohler Outreach Engine

> Filled in during Phase 11. Stub created in Phase 1 so subsequent phases can
> append evidence as they go.

## The five product questions

| # | Question | Status | Evidence | Next improvement |
| - | --- | --- | --- | --- |
| 1 | Which target companies have new roles? | partial | `/open-roles` shows `is_relevant=true` rows from `job_listings`; ingest cron is wired but provenance is incomplete. | Phase 3 — full provenance schema; Phase 6 — per-company roll-up. |
| 2 | Which roles fit Kohler best? | partial | `scoreTargetRole` in `targeting.ts` scores titles. No persisted `role_fit_scores` row, no PE/Mines sub-scores. | Phase 5. |
| 3 | Which roles support his PE-track path? | partial | `scoreTargetRole` adds `+12 PE path signal` when text matches; not surfaced as a separate score in UI. | Phase 5 + Phase 6. |
| 4 | Who is the best person to contact? | partial | RocketReach used for emails; `contacts` lacks structured `role_type`, `is_mines_alumni`, `is_possible_pe`. | Phase 7. |
| 5 | What is the next best action? | missing | No `recommended_action` field, no action-queue UI. | Phase 5 + Phase 8 + Phase 10. |

## Checks run this session

- (Phase 1) Read-only inventory; no checks executed.

(Each subsequent phase appends its checks here.)
