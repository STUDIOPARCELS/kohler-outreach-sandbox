import { requireAppOrigin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const KOHLER_SKILLS = [
  "SolidWorks", "GD&T", "tolerance stack-ups", "DFM/DFA",
  "FEA", "CFD (SolidWorks Flow Simulation)",
  "CNC machining", "MIG welding", "3D printing",
  "laser cutting", "waterjet", "plasma cutting",
  "MATLAB", "Python", "C++", "FMEA", "Scrum"
];

const DEFAULT_SENTENCE = "I have hands-on experience in mechanical design, prototyping, and fabrication.";

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const { jobTitle, jobSummary, companyName } = await req.json();
  if (!jobTitle) return NextResponse.json({ error: "jobTitle required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ sentence: DEFAULT_SENTENCE, matches: [], source: "default" });

  try {
    // Step 1: AI identifies skill matches
    const matchRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `You are a skill matcher. Return ONLY a JSON array of matched skill pairs.

JOB: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}
${jobSummary ? `DESCRIPTION: ${jobSummary}` : ""}

RESUME SKILLS: ${KOHLER_SKILLS.join(", ")}

Match rules:
- "CAD" → "SolidWorks"
- "tolerance analysis" → "tolerance stack-ups"
- "finite element" → "FEA"
- "additive manufacturing" → "3D printing"
- "machining"/"CNC" → "CNC machining"
- "welding" → "MIG welding"
- "fabrication" (hands-on) → "CNC machining"
- Do NOT match vague terms like "safety", "maintenance", "operating equipment"

Return ONLY JSON array: [{"job_skill":"from job","resume_skill":"from resume"}]
If no matches: []
ONLY the JSON array, no explanation.`
        }],
      }),
    });

    let matches: { job_skill: string; resume_skill: string }[] = [];
    if (matchRes.ok) {
      const matchData = await matchRes.json();
      let matchText = "";
      for (const block of (matchData.content || [])) {
        if (block.type === "text") matchText += block.text;
      }
      try {
        const cleaned = matchText.replace(/```json\n?|\n?```/g, "").trim();
        matches = JSON.parse(cleaned);
        if (!Array.isArray(matches)) matches = [];
        matches = matches.filter(m =>
          KOHLER_SKILLS.some(s => s.toLowerCase() === (m.resume_skill || "").toLowerCase())
        );
      } catch { matches = []; }
    }

    if (matches.length < 2) {
      return NextResponse.json({ sentence: DEFAULT_SENTENCE, matches: [], source: "default" });
    }

    // Step 2: Build skill list, ask AI to write ONE natural sentence
    const matchedSkills = Array.from(new Set(matches.map(m => m.resume_skill)));
    const sentenceRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Write ONE sentence for a cover letter. The applicant has these verified skills: ${matchedSkills.join(", ")}.

RULES:
- Start with "I have experience with"
- Name the skills listed above using those exact terms
- Add brief context like "from concept through prototype" or "for precision mechanical assemblies"
- 15-25 words total
- NEVER mention any school, lab, facility, company, industry, or sector
- NEVER say "capstone", "senior project", "coursework", "academic"
- NEVER add skills beyond what is listed above
- Output ONLY the sentence, nothing else`
        }],
      }),
    });

    let sentence = DEFAULT_SENTENCE;
    if (sentenceRes.ok) {
      const sentData = await sentenceRes.json();
      let sentText = "";
      for (const block of (sentData.content || [])) {
        if (block.type === "text") sentText += block.text;
      }
      sentText = sentText.trim().replace(/^["']|["']$/g, "");
      if (sentText.toLowerCase().startsWith("i have")) {
        sentence = sentText;
      }
    }

    return NextResponse.json({ sentence, matches, source: "claude-sonnet" });
  } catch {
    return NextResponse.json({ sentence: DEFAULT_SENTENCE, matches: [], source: "error" });
  }
}
