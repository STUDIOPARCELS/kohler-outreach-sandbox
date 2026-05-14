import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/202605140001_job_intelligence_spine.sql", import.meta.url),
  "utf8"
);

test("job intelligence migration creates the approved additive tables", () => {
  for (const table of ["job_sources", "sync_runs", "role_fit_scores", "outreach_actions"]) {
    assert.match(
      migration,
      new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`, "i"),
      `${table} table is missing`
    );
  }
});

test("migration does not drop or rewrite existing legacy tables", () => {
  assert.doesNotMatch(migration, /\bdrop\s+table\b/i);
  assert.doesNotMatch(migration, /\btruncate\s+table\b/i);
  assert.doesNotMatch(migration, /\balter\s+table\s+public\.(companies|contacts|job_listings|reachout_company_inserts|tracking)\b/i);
});

test("persisted scores include the core Kohler decision fields", () => {
  for (const column of [
    "skill_fit_score",
    "entry_level_score",
    "pe_track_score",
    "niche_score",
    "location_score",
    "mines_signal_score",
    "overall_score",
    "recommended_action",
    "explanation_json",
  ]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`, "i"), `${column} column is missing`);
  }
});

test("new job-intelligence tables are server-only by default", () => {
  for (const table of ["job_sources", "sync_runs", "role_fit_scores", "outreach_actions"]) {
    assert.match(
      migration,
      new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"),
      `${table} must enable RLS`
    );
  }
});
