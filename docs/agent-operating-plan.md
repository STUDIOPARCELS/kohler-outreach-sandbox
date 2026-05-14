# Agent Operating Plan

Date: 2026-05-14

## Non-Negotiable Baseline

The live Supabase schema inventory is the source of truth before any migration, adapter, or workflow change.

- Sandbox project ref: `nwsjgppkfducaikxsyvk`
- Sandbox inventory summary: `docs/supabase-true-sandbox-schema-inventory.md`
- Sandbox machine-readable inventory: `docs/supabase-true-sandbox-schema-inventory.json`
- Production-style project ref for later promotion comparison: `acwgirrldntjpzrhqmdh`
- Production-style inventory summary: `docs/supabase-live-schema-inventory.md`
- Required first step for schema work: compare proposed tables/columns against the inventory.
- If the inventory is stale, regenerate it from live `information_schema.tables` and `information_schema.columns` before editing migrations.

## Session Shape

Do not run the full 12-phase plan in one long context window. Work one bounded phase per session.

Every session exits with:

- plain-English summary of what changed
- files changed
- commands/browser checks run
- what is needed from the user next
- exact next Codex prompt for the following session

## Current Phase Order

1. Live schema inventory and reconciliation.
2. Runtime diagnostics and sandbox identity.
3. Job ingestion provenance against actual schema.
4. Job source adapter cleanup.
5. Kohler fit scoring and persisted scores.
6. Open Roles command-center UI.
7. Contact provider boundary and RocketReach normalization.
8. Outreach drafts and action queue.
9. Gmail draft/reply backfill.
10. Metrics dashboard.
11. Verification report.
12. Production promotion plan.

## Tool Scope

Use the smallest project-specific tool set:

- Supabase live schema access when available; otherwise use the authenticated Supabase SQL editor and service-role reads.
- Browser only for UI verification and authenticated dashboard checks.
- Vercel API/plugin for deployment inspection only; do not use Vercel CLI for deploy actions.
- Gmail only during draft/reply phases, with live send disabled unless explicitly gated.
- GitHub only for PR/review/commit verification if requested.
- Slack only for notifications if explicitly requested.

Avoid unrelated marketplace/plugins/connectors for this repo.
