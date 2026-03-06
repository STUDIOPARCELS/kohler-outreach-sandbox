import { NextRequest, NextResponse } from "next/server";

const KOHLER_SKILLS_LIST = `SolidWorks, GD&T, tolerance stack-ups, DFM/DFA, FEA, CFD (SolidWorks Flow Simulation), CNC machining, MIG welding, 3D printing, laser cutting, waterjet, plasma cutting, MATLAB, Python, C++, Arduino, FMEA, Scrum`;

const KOHLER_EXPERIENCE = `Designed and fabricated items using SolidWorks; operated CNC router; redesigned plucking mechanism for adaptive bass guitar capstone using 3D printing; designed stabilization system; modeled assemblies in SolidWorks; ran Scrum sprints; tracked risks with FMEA; fabricated mono-ski hardware using CNC; assisted with steel railing fabrication and installation`;

const DEFAULT_SKILL = "I have hands-on experience in mechanical design, prototyping, and fabrication, with skills in SolidWorks, CNC machining, and 3D printing.";

export async function POST(req: NextRequest) {
  const { jobTitle, jobSummary, companyName } = await req.json();
  if (!jobTitle) return NextResponse.json({ error: "jobTitle required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ sentence: DEFAULT_SKILL, matches: [], source: "default" });

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5.4-2026-03-05",
        input: `Match a job posting's required skills to this applicant's resume.

JOB: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}
${jobSummary ? `DESCRIPTION: ${jobSummary}` : ""}

RESUME SKILLS: ${KOHLER_SKILLS_LIST}
RESUME EXPERIENCE: ${KOHLER_EXPERIENCE}

MATCHING RULES:
- A match means the SAME skill/tool appears in both the job and the resume
- "CAD" matches "SolidWorks" (SolidWorks is CAD software)
- "tolerance analysis" matches "tolerance stack-ups"
- "fabrication" matches "CNC machining" or "MIG welding"
- "additive manufacturing" matches "3D printing"
- Do NOT match vague job terms to specific resume skills (e.g. "safety" ≠ "FMEA")

SENTENCE RULES — CRITICAL:
- Write ONE sentence, 15-25 words
- Start with "I have"
- Name ONLY skills that are on the resume using the resume's exact terms
- You may reference ONE specific project from the RESUME EXPERIENCE above to add context
- NEVER mention industries, sectors, or domains (no "aerospace", "multidisciplinary", "automotive", etc.)
- NEVER add adjectives or context not found on the resume
- NEVER say "engineering problem-solving" or "iterative development" or similar filler
- If you matched MATLAB → say "MATLAB". Do not say "MATLAB for aerospace analysis"
- Keep it factual and grounded in the resume only

BAD: "I have applied MATLAB and Python to aerospace-focused projects." (aerospace is NOT on resume)
BAD: "I have experience with SolidWorks and FEA." (too short, no context)
GOOD: "I have experience with SolidWorks modeling and FEA, and have taken designs from concept through prototype using CNC machining."
GOOD: "I have experience with MATLAB and Python, and have used SolidWorks to take designs from concept through fabrication."
GOOD: "I have hands-on experience with CNC machining, MIG welding, and 3D printing for prototype fabrication."

Return ONLY JSON (no markdown):
{"sentence":"...","matches":[{"job_skill":"from job","resume_skill":"from resume"}]}

If fewer than 2 genuine matches: {"sentence":"${DEFAULT_SKILL}","matches":[]}`,
        text: { format: { type: "text" } },
      }),
    });

    if (!res.ok) return NextResponse.json({ sentence: DEFAULT_SKILL, matches: [], source: "api_error" });

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

    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.sentence?.toLowerCase().startsWith("i have")) {
        return NextResponse.json({ sentence: parsed.sentence, matches: parsed.matches || [], source: "gpt54" });
      }
    } catch { /* parse failed */ }

    return NextResponse.json({ sentence: DEFAULT_SKILL, matches: [], source: "fallback" });
  } catch {
    return NextResponse.json({ sentence: DEFAULT_SKILL, matches: [], source: "error" });
  }
}
