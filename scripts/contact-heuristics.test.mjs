// Tests for the contact-classification heuristics (Phase 7).
// Re-implements the helpers in plain JS so the script runs without
// ts-node.

const ROLE_PATTERNS = [
  [/recruit(er|ing)|talent\s+acquisition|sourcer/i, "recruiter"],
  [/talent\b/i, "talent"],
  [/(?:engineering|manufacturing|design|mech|hardware|systems)\s+(?:manager|mgr)\b/i, "engineering_manager"],
  [/\bdirector\s+of\s+engineering|head\s+of\s+engineering|vp\s+engineering\b/i, "engineering_manager"],
  [/principal\s+engineer|principal\s+(?:mech|mechanical)\s+engineer/i, "principal_eng"],
  [/\bdesign\s+(?:lead|principal)\b/i, "design_lead"],
];
const SENIORITY_PATTERNS = [
  [/\b(?:cto|ceo|cfo|vp|vice\s+president|chief)\b/i, "exec"],
  [/\bdirector\b/i, "director"],
  [/\b(?:manager|mgr)\b/i, "manager"],
  [/\bprincipal\b/i, "principal"],
  [/\bsenior\b|\bsr\.?\b|\bstaff\b/i, "senior"],
  [/\bjunior\b|\bjr\.?\b|\bassociate\b|\bentry[-\s]?level\b/i, "junior"],
];
function categorizeRole(t) {
  if (!t) return null;
  for (const [re, type] of ROLE_PATTERNS) if (re.test(t)) return type;
  return "other";
}
function categorizeSeniority(t) {
  if (!t) return null;
  for (const [re, level] of SENIORITY_PATTERNS) if (re.test(t)) return level;
  return "mid";
}
function detectMinesAlumni({ bio, education, skills }) {
  const b = (bio || "").toLowerCase();
  if (/colorado\s+school\s+of\s+mines\b|csm\s+(?:grad|alum)\b|\bmines\s+(?:grad|alum)\b/.test(b)) return true;
  for (const e of education ?? []) if (e.school && /colorado\s+school\s+of\s+mines/i.test(e.school)) return true;
  for (const s of skills ?? []) if (/colorado\s+school\s+of\s+mines/i.test(s)) return true;
  return false;
}
const PE = /(?:,\s*p\.?e\.?\b|professional\s+engineer\b|\beit\b|engineer\s+in\s+training\b|licensed\s+engineer\b)/i;
function detectPE({ title, bio }) {
  return (title && PE.test(title)) || (bio && PE.test(bio)) || false;
}

let pass = 0, fail = 0;
function check(n, c, d="") { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`  FAIL ${n} ${d}`); } }

// Roles
check("EM detected", categorizeRole("Mechanical Engineering Manager") === "engineering_manager");
check("Director EM detected", categorizeRole("Director of Engineering") === "engineering_manager");
check("Principal eng detected", categorizeRole("Principal Mechanical Engineer") === "principal_eng");
check("Design lead detected", categorizeRole("Design Lead") === "design_lead");
check("Recruiter detected", categorizeRole("Senior Recruiter") === "recruiter");
check("Talent detected", categorizeRole("Talent Acquisition Partner") === "recruiter");
check("Other fallback", categorizeRole("Mechanical Engineer II") === "other");
check("Null title returns null", categorizeRole(null) === null);

// Seniority
check("Director seniority", categorizeSeniority("Director of Engineering") === "director");
check("VP seniority", categorizeSeniority("VP of Engineering") === "exec");
check("Manager seniority", categorizeSeniority("Engineering Manager") === "manager");
check("Senior seniority", categorizeSeniority("Senior Mechanical Engineer") === "senior");
check("Junior seniority", categorizeSeniority("Junior Engineer") === "junior");
check("Default mid", categorizeSeniority("Mechanical Engineer") === "mid");

// Mines
check("Mines bio detected", detectMinesAlumni({ bio: "Mines grad 2018" }) === true);
check("Mines education detected", detectMinesAlumni({ education: [{ school: "Colorado School of Mines" }] }) === true);
check("Non-Mines education", detectMinesAlumni({ education: [{ school: "MIT" }] }) === false);

// PE
check("PE title detected", detectPE({ title: "John Smith, P.E." }) === true);
check("EIT detected", detectPE({ title: "Jane Doe, EIT" }) === true);
check("PE bio detected", detectPE({ bio: "I am a licensed Professional Engineer." }) === true);
check("Non-PE", detectPE({ title: "Mechanical Engineer", bio: "Loves SolidWorks." }) === false);

console.log(`\ncontact-heuristics: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
