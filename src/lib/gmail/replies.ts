// Phase 9 — Gmail reply classification.
//
// Pure heuristics over a normalized message snippet/body. The Phase 9
// routes call `classifyReply` to bucket inbound mail into the
// product-defined categories so the dashboard can surface response
// rates without an LLM in the loop.

export type ReplyClassification =
  | "positive_reply"
  | "recruiter_screen"
  | "apply_online"
  | "referral"
  | "needs_follow_up"
  | "rejection"
  | "bounce"
  | "out_of_office"
  | "auto_reply"
  | "unknown";

export interface ClassifyInput {
  subject?: string | null;
  snippet?: string | null;
  body_text?: string | null;
  from_email?: string | null;
}

export interface ClassifyResult {
  classification: ReplyClassification;
  confidence: number; // 0..1
  signals: string[];
}

const RULES: Array<{
  cls: ReplyClassification;
  patterns: RegExp[];
  weight: number;
  signal: string;
}> = [
  { cls: "bounce", patterns: [/mailer-daemon|delivery\s+failure|address\s+(?:not\s+found|rejected)|undeliver/i], weight: 0.95, signal: "bounce keywords" },
  { cls: "out_of_office", patterns: [/out\s+of\s+(?:the\s+)?office|on\s+(?:annual|paid)\s+leave|i\s+am\s+away|currently\s+(?:traveling|out)|auto[-\s]?reply\s*:\s*out/i], weight: 0.9, signal: "OOO keywords" },
  { cls: "auto_reply", patterns: [/this\s+is\s+an\s+automatic\s+reply|do\s+not\s+reply|automated\s+(?:response|reply|message)/i], weight: 0.8, signal: "auto-reply keywords" },
  { cls: "rejection", patterns: [/we\s+(?:are\s+)?not\s+able\s+to\s+move\s+forward|will\s+not\s+be\s+moving\s+forward|other\s+candidates|(?:not|isn't)\s+(?:a\s+)?match|best\s+wishes\s+(?:in|with)\s+your\s+search|unfortunately,?\s+we|we\s+(?:have\s+)?(?:decided|chose)\s+to\s+move\s+forward\s+with\s+(?:other|another)/i], weight: 0.85, signal: "rejection keywords" },
  { cls: "recruiter_screen", patterns: [/grab\s+(?:a\s+)?(?:short\s+)?call|brief\s+screen|introductory\s+call|recruiter\s+screen|when\s+(?:are\s+you|works)\s+free|do\s+you\s+have\s+(?:15|20|30)\s+minutes/i], weight: 0.75, signal: "recruiter screen keywords" },
  { cls: "positive_reply", patterns: [/love\s+to\s+chat|happy\s+to\s+(?:talk|connect|meet)|let'?s\s+(?:set\s+up|jump\s+on|connect)|sounds\s+great|excited\s+to\s+meet|interested|would\s+be\s+glad\s+to/i], weight: 0.7, signal: "positive language" },
  { cls: "referral", patterns: [/(?:loop|cc|copy)(?:ing)?\s+in|let\s+me\s+introduce|introduce\s+you\s+to|i'?ll\s+forward|forwarding\s+to/i], weight: 0.7, signal: "referral keywords" },
  { cls: "apply_online", patterns: [/apply\s+(?:on|via|through|here|directly)|submit\s+(?:your\s+)?application|complete\s+the\s+application/i], weight: 0.6, signal: "apply-online keywords" },
  { cls: "needs_follow_up", patterns: [/follow\s+up|circle\s+back|let\s+me\s+know|when\s+you\s+(?:get\s+a\s+chance|have\s+time)|in\s+touch\s+later/i], weight: 0.5, signal: "follow-up keywords" },
];

export function classifyReply(input: ClassifyInput): ClassifyResult {
  const corpus = [input.subject ?? "", input.snippet ?? "", input.body_text ?? ""].join(" \n ");
  const signals: string[] = [];
  const scoreByClass: Record<ReplyClassification, number> = {
    positive_reply: 0,
    recruiter_screen: 0,
    apply_online: 0,
    referral: 0,
    needs_follow_up: 0,
    rejection: 0,
    bounce: 0,
    out_of_office: 0,
    auto_reply: 0,
    unknown: 0,
  };

  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(corpus))) {
      scoreByClass[rule.cls] = Math.max(scoreByClass[rule.cls], rule.weight);
      signals.push(rule.signal);
    }
  }

  // Sender-based hints.
  if (input.from_email) {
    if (/@(?:greenhouse|lever|workday|ashbyhq|smartrecruiters|workable|icims)\.(?:io|com|net)/i.test(input.from_email)) {
      scoreByClass.apply_online = Math.max(scoreByClass.apply_online, 0.55);
      signals.push("ATS sender domain");
    }
    if (/postmaster|mailer-daemon|noreply|no-reply|donotreply/i.test(input.from_email)) {
      scoreByClass.auto_reply = Math.max(scoreByClass.auto_reply, 0.55);
      signals.push("automated sender");
    }
  }

  let bestClass: ReplyClassification = "unknown";
  let bestScore = 0;
  for (const cls of Object.keys(scoreByClass) as ReplyClassification[]) {
    if (scoreByClass[cls] > bestScore) {
      bestScore = scoreByClass[cls];
      bestClass = cls;
    }
  }

  if (bestScore === 0) {
    return { classification: "unknown", confidence: 0, signals };
  }
  return { classification: bestClass, confidence: bestScore, signals };
}
