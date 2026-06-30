import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

/* ── Transpile the typed data lib and import it (same pattern as scripts/*.test.mjs) ── */
const libSource = await readFile(new URL("../src/lib/projectBuilds.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(libSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const {
  PROJECT_BUILDS,
  PROJECT_BUILD_SUMMARY,
  REAL_WORLD_RANKING,
  COMPLEXITY_RANKING,
  BUILD_SEQUENCE,
  SKILL_COVERAGE,
  PROJECT_FILTERS,
} = await import(moduleUrl);

/* ── Source files checked as text ── */
const navSource = await readFile(new URL("../src/components/Nav.tsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/app/project-builds/page.tsx", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");

test("exactly six projects exist", () => {
  assert.equal(PROJECT_BUILDS.length, 6);
});

test("display order follows original numbers 10, 8, 4, 3, 2, 1", () => {
  assert.deepEqual(
    PROJECT_BUILDS.map((p) => p.originalNumber),
    [10, 8, 4, 3, 2, 1]
  );
  // order index is sequential 1..6
  assert.deepEqual(
    PROJECT_BUILDS.map((p) => p.order),
    [1, 2, 3, 4, 5, 6]
  );
});

test("total estimated hours are 200-290", () => {
  const low = PROJECT_BUILDS.reduce((sum, p) => sum + p.hoursLow, 0);
  const high = PROJECT_BUILDS.reduce((sum, p) => sum + p.hoursHigh, 0);
  assert.equal(low, 200);
  assert.equal(high, 290);
  assert.equal(PROJECT_BUILD_SUMMARY.totalHoursLow, 200);
  assert.equal(PROJECT_BUILD_SUMMARY.totalHoursHigh, 290);
  assert.equal(PROJECT_BUILD_SUMMARY.totalHoursLabel, "200–290");
});

test("rankings, sequence, and skill coverage each cover all six projects", () => {
  const ids = new Set(PROJECT_BUILDS.map((p) => p.id));
  for (const [name, rows] of [
    ["real-world", REAL_WORLD_RANKING],
    ["complexity", COMPLEXITY_RANKING],
    ["sequence", BUILD_SEQUENCE],
  ]) {
    assert.equal(rows.length, 6, `${name} should have six rows`);
    for (const row of rows) assert.ok(ids.has(row.projectId), `${name} references unknown project ${row.projectId}`);
  }
  // every skill maps only to known projects, and three skills cover all six
  const allSix = SKILL_COVERAGE.filter((s) => s.projectIds.length === 6);
  assert.ok(allSix.length >= 3, "test planning, dashboard communication, portfolio storytelling cover all six");
  for (const s of SKILL_COVERAGE) {
    for (const pid of s.projectIds) assert.ok(ids.has(pid), `skill ${s.skill} references unknown project ${pid}`);
  }
});

test("highest-value and fastest projects match the OBD-II logger and tool organizer", () => {
  assert.equal(REAL_WORLD_RANKING[0].projectId, "obd-logger");
  assert.equal(COMPLEXITY_RANKING[0].projectId, "bottle-jack");
  assert.equal(BUILD_SEQUENCE[0].projectId, "tool-organizer");
  assert.match(PROJECT_BUILD_SUMMARY.highestValueProject, /OBD-II/);
  assert.match(PROJECT_BUILD_SUMMARY.fastestProject, /Tool Organizer/);
});

test("nav links include /project-builds with desktop and mobile labels", () => {
  assert.match(navSource, /\/project-builds/);
  assert.match(navSource, /Project Builds/);
  assert.match(navSource, /Builds/); // compact mobile label
  // reachable from the main dashboard header too
  assert.match(dashboardSource, /\/project-builds/);
});

test("the page includes all core dashboard sections", () => {
  const sections = [
    "Overview",
    "Projects",
    "Real-World Value Ranking",
    "Build Complexity Ranking",
    "Time Estimate Summary",
    "Skill Coverage Matrix",
    "Universal Deliverables",
    "Recommended Build Sequence",
    "Final Portfolio Positioning",
  ];
  for (const s of sections) {
    assert.ok(pageSource.includes(s), `page is missing the "${s}" section`);
  }
});

test("projects render as tabs, not a stacked accordion", () => {
  // one project shown at a time via tab selection, not all six expanded in a list
  assert.match(pageSource, /activeId/);
  assert.match(pageSource, /setActiveId/);
  assert.match(pageSource, /ProjectPanel/);
  // the old per-project accordion anchor/toggle pattern is gone
  assert.doesNotMatch(pageSource, /detail-\$\{project\.id\}/);
  assert.doesNotMatch(pageSource, /onToggle/);
  assert.doesNotMatch(pageSource, /Open details/);
});

test("the page wires the required interactions", () => {
  assert.match(pageSource, /Copy resume line/i);
  assert.match(pageSource, /Print summary/i);
  assert.match(pageSource, /window\.print\(\)/);
  // the page renders the filter buttons from PROJECT_FILTERS
  assert.match(pageSource, /PROJECT_FILTERS/);
});

test("the guide filter categories are exposed in order", () => {
  assert.deepEqual(PROJECT_FILTERS, [
    "All",
    "Automotive",
    "Thermal",
    "Structural",
    "CAD",
    "Fabrication",
    "Data / Instrumentation",
  ]);
});
