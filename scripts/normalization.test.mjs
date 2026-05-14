// Tests for the pure helpers in src/lib/jobIngest/normalization.ts.
// Run with: node scripts/normalization.test.mjs
//
// We re-implement the helpers here in plain JS to keep this script free of
// a TypeScript transpiler. If the source contracts change, mirror them.

import { createHash } from "node:crypto";

function normalizeCompanyName(name) {
  if (!name) return "";
  return name
    .replace(
      /[,\s]+(Corp\.?|Corporation|Inc\.?|LLC|Ltd\.?|Co\.?|Manufacturing|Services|Industries|Group)\.?\s*$/i,
      ""
    )
    .trim();
}

function slugify(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildZipRecruiterContentKey(company, title, location) {
  const input = [
    normalizeCompanyName(company).toLowerCase().trim(),
    (title || "").toLowerCase().trim(),
    (location || "").toLowerCase().trim(),
  ].join("|");
  return "zrc_" + createHash("sha256").update(input).digest("hex").slice(0, 20);
}

function canonicalizeUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    u.hash = "";
    const tracking = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gh_src",
      "gh_jid",
      "src",
      "source",
      "ref",
      "trk",
    ];
    for (const p of tracking) u.searchParams.delete(p);
    const entries = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    u.search = "";
    for (const [k, v] of entries) u.searchParams.append(k, v);
    return `${u.protocol}//${u.host}${u.pathname}${u.search ? `?${u.searchParams.toString()}` : ""}`;
  } catch {
    return rawUrl.toLowerCase().trim();
  }
}

function normalizedHash(input) {
  const composite = [
    normalizeCompanyName(input.company).toLowerCase().trim(),
    (input.title || "").toLowerCase().replace(/\s+/g, " ").trim(),
    (input.location || "").toLowerCase().replace(/\s+/g, " ").trim(),
    canonicalizeUrl(input.apply_url || ""),
  ].join("|");
  return createHash("sha256").update(composite).digest("hex").slice(0, 32);
}

function buildExternalJobKey({ source_type, upstream_id, company, title, location }) {
  if (upstream_id) return `${source_type}_${upstream_id}`;
  return buildZipRecruiterContentKey(company, title, location || "");
}

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok =
    typeof expected === "function" ? expected(actual) : actual === expected;
  if (ok) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} — expected ${expected}, got ${actual}`);
  }
}

// normalizeCompanyName
check("strips ', Inc.'", normalizeCompanyName("Lockheed Martin, Inc."), "Lockheed Martin");
check("strips trailing 'Corp'", normalizeCompanyName("Acme Corp"), "Acme");
check("strips trailing 'LLC'", normalizeCompanyName("Foo Bar LLC"), "Foo Bar");
check("preserves embedded keywords", normalizeCompanyName("Manufacturing Solutions"), "Manufacturing Solutions");
check("handles empty", normalizeCompanyName(""), "");

// slugify
check("slugifies basic name", slugify("Lockheed Martin"), "lockheed-martin");
check("slugifies with punctuation", slugify("Ball Aerospace & Tech."), "ball-aerospace-tech");
check("trims dashes", slugify("  -- Foo Bar -- "), "foo-bar");

// buildZipRecruiterContentKey is deterministic and case-insensitive
const k1 = buildZipRecruiterContentKey("Acme Corp", "Mechanical Engineer", "Denver, CO");
const k2 = buildZipRecruiterContentKey("acme", "mechanical engineer", "DENVER, CO");
check("zr key is case-insensitive after normalization", k1, k2);
check("zr key has zrc_ prefix", k1.startsWith("zrc_"), true);
check("zr key is short hash", k1.length, "zrc_".length + 20);

// canonicalizeUrl strips utm and sorts params
check(
  "canonicalize strips utm",
  canonicalizeUrl("https://jobs.example.com/job/123?utm_source=a&utm_medium=b&id=42"),
  "https://jobs.example.com/job/123?id=42"
);
check(
  "canonicalize sorts params",
  canonicalizeUrl("https://x.com/a?b=2&a=1"),
  "https://x.com/a?a=1&b=2"
);
check(
  "canonicalize drops fragments",
  canonicalizeUrl("https://x.com/a#frag"),
  "https://x.com/a"
);
check(
  "canonicalize tolerates garbage",
  canonicalizeUrl("not a url"),
  "not a url"
);

// normalizedHash should be stable and ignore tracking
const h1 = normalizedHash({
  company: "Ball Aerospace, Inc.",
  title: "Mechanical Engineer",
  location: "Boulder, CO",
  apply_url: "https://ball.com/job/42?utm_source=zr",
});
const h2 = normalizedHash({
  company: "ball aerospace",
  title: "mechanical engineer",
  location: "boulder, co",
  apply_url: "https://ball.com/job/42",
});
check("normalizedHash ignores casing/utm", h1, h2);
check("normalizedHash is 32-char hex", /^[0-9a-f]{32}$/.test(h1), true);

// buildExternalJobKey
check(
  "external key prefers upstream id",
  buildExternalJobKey({ source_type: "greenhouse_careers", upstream_id: "12345", company: "x", title: "y" }),
  "greenhouse_careers_12345"
);
check(
  "external key falls back to content fingerprint",
  buildExternalJobKey({ source_type: "manual_seed", company: "Acme", title: "Mech Eng", location: "Denver" }).startsWith("zrc_"),
  true
);

console.log(`\nnormalization: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
