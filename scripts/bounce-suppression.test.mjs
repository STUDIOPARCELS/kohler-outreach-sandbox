import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/bounceSuppression.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
let output = compiled.outputText.replace('import { supabaseAdmin } from "@/lib/supabaseAdmin";', "const supabaseAdmin = {};");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
const { extractEmails } = await import(moduleUrl);

test("extracts unique recipient emails for bounce suppression", () => {
  assert.deepEqual(extractEmails("A <FIRST@Example.com>, second@example.com; first@example.com"), [
    "first@example.com",
    "second@example.com",
  ]);
});

test("ignores empty recipient strings", () => {
  assert.deepEqual(extractEmails("not an email"), []);
});
