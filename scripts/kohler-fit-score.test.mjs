// Tests for Kohler fit scoring (Phase 5).
// Re-implements the scoring logic in plain JS so it runs without ts-node.

const PE_SIGNALS = [
  "engineer in training",
  "engineer-in-training",
  "eit",
  "professional engineer",
  " p.e. ",
  " pe ",
  "fe exam",
  "abet",
  "licensed engineer",
  "stamp drawing",
  "stamped drawing",
  "supervision of a pe",
  "under the supervision",
  "design calculation",
  "consulting engineering",
  "mep",
  "civil",
  "geotechnical",
  "water resources",
  "environmental engineer",
  "forensic engineer",
  "field engineer",
];

const TARGET_HOT = new Set([
  "MEP / HVAC / Building Systems",
  "Aerospace / Space",
  "Manufacturing / Automation / Product Design",
  "Government / Public Works / Infrastructure",
  "Water / Environmental / Geotech",
  "Quantum / Deep Tech / Electronics / Robotics",
  "Energy / Renewables / Power",
]);
const TARGET_WARM = new Set([
  "Construction / Civil / Heavy Industry",
  "Metals / Material Science",
  "Medical / Biotech",
  "Automotive / Vehicles",
]);

const DEFAULT_SKILLS = [
  "mechanical design", "solidworks", "fea", "cfd", "heat transfer", "cnc",
  "fabrication", "mig welding", "3d printing", "dfm", "dfa", "fmea",
  "python", "matlab", "c++", "prototyping", "manufacturing engineering",
  "test engineering", "aerospace", "defense", "advanced manufacturing",
  "robotics", "acoustics", "audio", "precision fabrication",
  "architectural fabrication", "millwork",
];

const COLORADO_RE = /\b(?:denver|lakewood|golden|boulder|littleton|englewood|arvada|aurora|broomfield|westminster|centennial|longmont|loveland|fort\s+collins|colorado\s+springs|colorado|\bco\b)\b/i;
const SENIOR_RE = /\b(?:senior|sr\.?|principal|staff|lead\s+engineer|director|head\s+of|chief\s+engineer|vp|vice\s+president|level\s*[3-9]|ii{2,}|i{4,})\b/i;
const JUNIOR_RE = /\b(?:entry[-\s]?level|new\s+grad|graduate|associate|junior|jr\.?|engineer\s*(?:i|1)\b|level\s*[12]|college\s+grad)\b/i;
const MANAGER_RE = /\b(?:manager|supervisor|team\s+lead)\b/i;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function corpus(j) { return [j.title || "", j.body_text || "", j.description || ""].join(" \n ").toLowerCase(); }
function matchedSkills(text) {
  return DEFAULT_SKILLS.filter((s) => new RegExp(`\\b${s.replace(/[+]/g, "\\+")}\\b`, "i").test(text));
}
function detectPeSignals(text) {
  return PE_SIGNALS.filter((s) => text.includes(s)).map((s) => s.trim());
}
function locationBand(loc) {
  if (!loc) return { score: 4, band: "unknown" };
  const l = loc.toLowerCase();
  if (COLORADO_RE.test(l)) return { score: 18, band: "colorado_or_denver" };
  if (l.includes("remote")) return { score: 8, band: "remote" };
  if (/\b(?:utah|wyoming|nebraska|kansas|new\s+mexico|arizona)\b/.test(l)) return { score: 4, band: "neighbor_state" };
  return { score: -8, band: "out_of_region" };
}
function nicheBand(n) {
  if (!n) return { score: 0, match: null };
  if (TARGET_HOT.has(n)) return { score: 16, match: "hot" };
  if (TARGET_WARM.has(n)) return { score: 8, match: "warm" };
  return { score: 0, match: "other" };
}
function seniorityFlag(text, title) {
  const both = `${title} \n ${text}`;
  if (JUNIOR_RE.test(both)) return "junior_friendly";
  if (SENIOR_RE.test(both)) return "senior_only";
  return "ambiguous";
}
function recommend({ overall, pe, niche, isMines, seniority, hasJobUrl }) {
  if (seniority === "senior_only" && overall < 60) return "skip";
  if (overall >= 80 && seniority !== "senior_only") return "apply_now";
  if (pe >= 12 && niche >= 8) return "pe_track_outreach";
  if (isMines && overall >= 40) return "alumni_outreach";
  if (overall >= 55 && hasJobUrl) return "email_engineering_manager";
  if (overall >= 40) return "email_recruiter";
  if (overall >= 25) return "physical_letter";
  if (overall >= 0) return "monitor";
  return "skip";
}

function score(job, profile = { is_mines_alumni: true }) {
  const text = corpus(job);
  const title = (job.title || "").toLowerCase();
  const matched = matchedSkills(text);
  const skill = clamp(Math.round(matched.length * 3.5), 0, 30);
  const seniority = seniorityFlag(text, title);
  const entry = seniority === "junior_friendly" ? 20 : seniority === "ambiguous" ? 10 : 0;
  const pe = clamp(detectPeSignals(text).length * 5, 0, 20);
  const nicheRes = nicheBand(job.niche);
  const loc = locationBand(job.location);
  const minesSignal = profile.is_mines_alumni && /\bcolorado\s+school\s+of\s+mines\b/i.test(text)
    ? 8 : profile.is_mines_alumni ? 2 : 0;
  const overall = clamp(skill + entry + pe + nicheRes.score + loc.score + minesSignal, 0, 100);
  return {
    skill, entry, pe, niche: nicheRes.score, location: loc.score, minesSignal, overall,
    recommended_action: recommend({
      overall, pe, niche: nicheRes.score, isMines: !!profile.is_mines_alumni, seniority,
      hasJobUrl: !!(job.apply_url || job.job_url),
    }),
    seniority,
    matched_count: matched.length,
  };
}

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

// Hot mechanical engineer in Denver with EIT — should score high.
const r1 = score({
  title: "Mechanical Engineer I",
  body_text: "Entry-level role for a recent BSME / EIT. SolidWorks, FEA, GD&T. Working under supervision of a PE.",
  location: "Denver, CO",
  niche: "MEP / HVAC / Building Systems",
  apply_url: "https://example.com/apply",
});
check("entry-level Denver MEP scores high", r1.overall >= 70, JSON.stringify(r1));
check("entry-level recommended apply or alumni", ["apply_now", "alumni_outreach", "email_engineering_manager", "pe_track_outreach"].includes(r1.recommended_action), r1.recommended_action);
check("PE signals detected", r1.pe > 0);
check("Mines bonus when alumni", r1.minesSignal === 2);

// Senior aerospace director out-of-state — should be skip.
const r2 = score({
  title: "Senior Director of Mechanical Engineering",
  body_text: "20+ years experience required. Lead a team of senior engineers.",
  location: "Huntsville, AL",
  niche: "Aerospace / Space",
});
check("senior out-of-state scores low", r2.overall < 30, JSON.stringify(r2));
check("senior out-of-state skipped", r2.recommended_action === "skip", r2.recommended_action);

// Mid-tier Lever-style posting in Boulder.
const r3 = score({
  title: "Manufacturing Engineer",
  body_text: "Looking for a manufacturing engineer with CNC, DFM, FMEA, fabrication experience.",
  location: "Boulder, CO",
  niche: "Manufacturing / Automation / Product Design",
  apply_url: "https://example.com/apply",
});
check("mid-tier manufacturing role >=55", r3.overall >= 55, JSON.stringify(r3));

// Mines-alumni explicit mention should add the +8 bonus.
const r4 = score({
  title: "Mechanical Engineer",
  body_text: "Colorado School of Mines grads encouraged to apply. EIT preferred.",
  location: "Golden, CO",
  niche: "Energy / Renewables / Power",
});
check("Mines explicit mention adds +8", r4.minesSignal === 8, JSON.stringify(r4));

// Remote role gets remote band.
const r5 = score({
  title: "Mechanical Design Engineer",
  body_text: "Fully remote. SolidWorks. CAD modeling.",
  location: "Remote",
  niche: "Manufacturing / Automation / Product Design",
});
check("remote role gets +8 band", r5.location === 8, JSON.stringify(r5));

// Manager title should be flagged but not auto-skipped if the score is still good.
const r6 = score({
  title: "Engineering Manager",
  body_text: "Mid-career engineer who can lead. SolidWorks, FEA.",
  location: "Denver, CO",
  niche: "Aerospace / Space",
});
check("manager title with hot signals still tracks", r6.overall > 30, JSON.stringify(r6));

console.log(`\nkohler-fit-score: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
