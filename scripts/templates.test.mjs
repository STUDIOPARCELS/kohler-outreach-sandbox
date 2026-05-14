// Tests for outreach template renderer (Phase 8). Re-implements the
// pickTemplate routing logic in plain JS.

function pickTemplate({ recommended_action, hasJob }) {
  switch (recommended_action) {
    case "apply_now":
    case "email_engineering_manager":
      return hasJob ? "active_job_em" : "company_intro";
    case "email_recruiter":
      return hasJob ? "active_job_recruiter" : "company_intro";
    case "alumni_outreach":
      return "mines_alumni";
    case "pe_track_outreach":
      return "pe_track";
    case "physical_letter":
      return "physical_letter";
    case "monitor":
    case "skip":
    default:
      return "company_intro";
  }
}

let pass = 0, fail = 0;
function check(n, c, d="") { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`  FAIL ${n} ${d}`); } }

check("apply_now + job → active_job_em", pickTemplate({ recommended_action: "apply_now", hasJob: true }) === "active_job_em");
check("apply_now no job → company_intro", pickTemplate({ recommended_action: "apply_now", hasJob: false }) === "company_intro");
check("email_recruiter + job → active_job_recruiter", pickTemplate({ recommended_action: "email_recruiter", hasJob: true }) === "active_job_recruiter");
check("alumni_outreach → mines_alumni", pickTemplate({ recommended_action: "alumni_outreach", hasJob: true }) === "mines_alumni");
check("pe_track_outreach → pe_track", pickTemplate({ recommended_action: "pe_track_outreach", hasJob: false }) === "pe_track");
check("physical_letter → physical_letter", pickTemplate({ recommended_action: "physical_letter", hasJob: false }) === "physical_letter");
check("monitor → company_intro", pickTemplate({ recommended_action: "monitor", hasJob: false }) === "company_intro");
check("skip → company_intro", pickTemplate({ recommended_action: "skip", hasJob: false }) === "company_intro");
check("unknown → company_intro", pickTemplate({ recommended_action: "weird", hasJob: false }) === "company_intro");

console.log(`\ntemplates: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
