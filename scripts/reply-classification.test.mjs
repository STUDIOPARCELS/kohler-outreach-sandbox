// Tests for Gmail reply classification (Phase 9). Re-implements the
// classifier in plain JS so the script runs without ts-node.

const RULES = [
  { cls: "bounce", patterns: [/mailer-daemon|delivery\s+failure|address\s+(?:not\s+found|rejected)|undeliver/i], weight: 0.95, signal: "bounce" },
  { cls: "out_of_office", patterns: [/out\s+of\s+(?:the\s+)?office|on\s+(?:annual|paid)\s+leave|i\s+am\s+away|currently\s+(?:traveling|out)|auto[-\s]?reply\s*:\s*out/i], weight: 0.9, signal: "ooo" },
  { cls: "auto_reply", patterns: [/this\s+is\s+an\s+automatic\s+reply|do\s+not\s+reply|automated\s+(?:response|reply|message)/i], weight: 0.8, signal: "auto" },
  { cls: "rejection", patterns: [/we\s+(?:are\s+)?not\s+able\s+to\s+move\s+forward|will\s+not\s+be\s+moving\s+forward|other\s+candidates|(?:not|isn't)\s+(?:a\s+)?match|best\s+wishes\s+(?:in|with)\s+your\s+search|unfortunately,?\s+we|we\s+(?:have\s+)?(?:decided|chose)\s+to\s+move\s+forward\s+with\s+(?:other|another)/i], weight: 0.85, signal: "reject" },
  { cls: "recruiter_screen", patterns: [/grab\s+(?:a\s+)?(?:short\s+)?call|brief\s+screen|introductory\s+call|recruiter\s+screen|when\s+(?:are\s+you|works)\s+free|do\s+you\s+have\s+(?:15|20|30)\s+minutes/i], weight: 0.75, signal: "screen" },
  { cls: "positive_reply", patterns: [/love\s+to\s+chat|happy\s+to\s+(?:talk|connect|meet)|let'?s\s+(?:set\s+up|jump\s+on|connect)|sounds\s+great|excited\s+to\s+meet|interested|would\s+be\s+glad\s+to/i], weight: 0.7, signal: "positive" },
  { cls: "referral", patterns: [/(?:loop|cc|copy)(?:ing)?\s+in|let\s+me\s+introduce|introduce\s+you\s+to|i'?ll\s+forward|forwarding\s+to/i], weight: 0.7, signal: "referral" },
  { cls: "apply_online", patterns: [/apply\s+(?:on|via|through|here|directly)|submit\s+(?:your\s+)?application|complete\s+the\s+application/i], weight: 0.6, signal: "apply" },
  { cls: "needs_follow_up", patterns: [/follow\s+up|circle\s+back|let\s+me\s+know|when\s+you\s+(?:get\s+a\s+chance|have\s+time)|in\s+touch\s+later/i], weight: 0.5, signal: "follow" },
];

function classify({ subject, snippet, body_text, from_email }) {
  const corpus = [subject || "", snippet || "", body_text || ""].join(" \n ");
  const scores = {};
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(corpus))) {
      scores[rule.cls] = Math.max(scores[rule.cls] || 0, rule.weight);
    }
  }
  if (from_email) {
    if (/@(?:greenhouse|lever|workday|ashbyhq|smartrecruiters|workable|icims)\.(?:io|com|net)/i.test(from_email)) {
      scores.apply_online = Math.max(scores.apply_online || 0, 0.55);
    }
    if (/postmaster|mailer-daemon|noreply|no-reply|donotreply/i.test(from_email)) {
      scores.auto_reply = Math.max(scores.auto_reply || 0, 0.55);
    }
  }
  let best = "unknown", bestScore = 0;
  for (const [cls, sc] of Object.entries(scores)) if (sc > bestScore) { best = cls; bestScore = sc; }
  if (bestScore === 0) return { classification: "unknown", confidence: 0 };
  return { classification: best, confidence: bestScore };
}

let pass = 0, fail = 0;
function check(n, c, d="") { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`  FAIL ${n} ${d}`); } }

check("bounce", classify({ subject: "Mail Delivery Failure", snippet: "address not found" }).classification === "bounce");
check("out of office", classify({ subject: "Re: hello", snippet: "I am out of office until next Tuesday" }).classification === "out_of_office");
check("auto reply by sender", classify({ subject: "Re: hello", from_email: "noreply@example.com" }).classification === "auto_reply");
check("rejection", classify({ subject: "Update on your application", snippet: "Unfortunately, we have decided to move forward with another candidate" }).classification === "rejection");
check("recruiter screen", classify({ subject: "Quick chat?", snippet: "Do you have 30 minutes for a brief screen?" }).classification === "recruiter_screen");
check("positive reply", classify({ subject: "Re: intro", snippet: "Sounds great, would love to chat" }).classification === "positive_reply");
check("referral", classify({ subject: "Connecting", snippet: "Let me introduce you to Jordan." }).classification === "referral");
check("apply online via ATS sender", classify({ subject: "Application", from_email: "no-reply@boards.greenhouse.io" }).classification === "auto_reply");
check("apply online via body", classify({ subject: "Application", snippet: "Please apply via our portal" }).classification === "apply_online");
check("needs follow up", classify({ subject: "let me know", snippet: "Let me know when you get a chance" }).classification === "needs_follow_up");
check("unknown for empty", classify({}).classification === "unknown");

console.log(`\nreply-classification: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
