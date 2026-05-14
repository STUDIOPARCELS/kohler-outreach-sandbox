import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/kohlerFitScore.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { scoreJobForKohler } = await import(moduleUrl);

test("scores high-fit EIT mechanical roles with PE-track signals", () => {
  const score = scoreJobForKohler({
    title: "Mechanical Engineer I - EIT",
    companyname: "Front Range MEP",
    location: "Denver, CO",
    description: "SolidWorks, design calculations, under supervision of a licensed Professional Engineer.",
    contact_count: 2,
    email_count: 1,
  });

  assert.equal(score.recommended_action, "pe_track_outreach");
  assert.ok(score.overall_score >= 50);
  assert.ok(score.pe_track_score >= 50);
  assert.ok(score.explanation_json.pe_track_signals.length >= 2);
});

test("downgrades senior non-target roles", () => {
  const score = scoreJobForKohler({
    title: "Senior Sales Manager",
    location: "New York, NY",
    description: "Manage sales team and recruiting pipeline.",
  });

  assert.equal(score.recommended_action, "skip");
  assert.ok(score.overall_score < 35);
  assert.ok(score.explanation_json.risk_signals.length > 0);
});
