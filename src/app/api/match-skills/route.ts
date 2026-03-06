import { NextRequest, NextResponse } from "next/server";

const KOHLER_SKILLS = [
  "SolidWorks", "GD&T", "tolerance stack-ups", "DFM/DFA",
  "FEA", "CFD (SolidWorks Flow Simulation)",
  "CNC machining", "MIG welding", "3D printing",
  "laser cutting", "waterjet", "plasma cutting",
  "MATLAB", "Python", "C++", "Arduino", "FMEA", "Scrum"
];

const DEFAULT_SENTENCE = "I have hands-on experience in mechanical design, prototyping, and fabrication, with skills in SolidWorks, CNC machining, and 3D printing.";

export async function POST(req: NextRequest) {
  const { jobTitle, jobSummary, companyName } = await req.json();
  if (!jobTitle) return NextResponse.json({ error: "jobTitle required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ sentence: DEFAULT_SENTENCE, matches: [], source: "default" });

  try {
    // AI ONLY identifies matches — it does NOT write the sentence
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5.4-2026-03-05",
        input: `You are a skill matcher. Your ONLY job is to identify which skills from a resume appear in a job posting. You do NOT write sentences. You do NOT add context. You return ONLY a JSON array of matched pairs.

JOB: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}
${jobSummary ? `DESCRIPTION: ${jobSummary}` : ""}

RESUME SKILLS: ${KOHLER_SKILLS.join(", ")}

For each resume skill, check if the job posting requires it or something equivalent:
- "CAD" or "computer-aided design" → matches "SolidWorks"
- "tolerance analysis" → matches "tolerance stack-ups"
- "finite element" → matches "FEA"
- "additive manufacturing" → matches "3D printing"
- "machining" or "CNC" → matches "CNC machining"
- "welding" → matches "MIG welding"
- "fabrication" (hands-on) → matches "CNC machining"

Do NOT match vague terms: "safety" ≠ "FMEA", "equipment maintenance" ≠ "CNC machining", "operating" ≠ "CNC machining"

Return ONLY a JSON array (no markdown, no backticks, no explanation):
[{"job_skill":"exact term from job","resume_skill":"exact term from resume skills list above"}]

If no skills match, return: []`,
        text: { format: { type: "text" } },
      }),
    });

    if (!res.ok) return NextResponse.json({ sentence: DEFAULT_SENTENCE, matches: [], source: "api_error" });

    const data = await res.json();
    let text = "";
    if (data.output) {
      for (const item of data.output) {
        if (item.type === "message" && item.content) {
          for (const c of item.content) {
            if (c.type === "output_text") text += c.text;
          }
        }
      }
    }

    let matches: { job_skill: string; resume_skill: string }[] = [];
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      matches = JSON.parse(cleaned);
      if (!Array.isArray(matches)) matches = [];
      // Validate: every resume_skill must actually be on the resume
      matches = matches.filter(m =>
        KOHLER_SKILLS.some(s => s.toLowerCase() === (m.resume_skill || "").toLowerCase())
      );
    } catch { matches = []; }

    // BUILD THE SENTENCE DETERMINISTICALLY — no AI generation
    let sentence = DEFAULT_SENTENCE;
    if (matches.length >= 2) {
      const skills = Array.from(new Set(matches.map(m => m.resume_skill)));
      if (skills.length === 1) {
        sentence = `I have experience with ${skills[0]} and have taken designs from concept through prototype and fabrication.`;
      } else if (skills.length === 2) {
        sentence = `I have experience with ${skills[0]} and ${skills[1]}, and have taken designs from concept through prototype and fabrication.`;
      } else {
        const allButLast = skills.slice(0, -1);
        const last = skills[skills.length - 1];
        sentence = `I have experience with ${allButLast.join(", ")}, and ${last}.`;
      }
    }

    return NextResponse.json({ sentence, matches, source: matches.length >= 2 ? "matched" : "default" });
  } catch {
    return NextResponse.json({ sentence: DEFAULT_SENTENCE, matches: [], source: "error" });
  }
}
