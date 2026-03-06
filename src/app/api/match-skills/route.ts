import { NextRequest, NextResponse } from "next/server";

const KOHLER_RESUME_SKILLS = `EXACT SKILLS (use ONLY these exact terms):
SolidWorks, GD&T, tolerance stack-ups, DFM/DFA, FEA, CFD (SolidWorks Flow Simulation), CNC machining, MIG welding, 3D printing, laser cutting, waterjet, plasma cutting, MATLAB, Python, C++, Arduino, FMEA, Scrum`;

const DEFAULT_SKILL = "I have experience with SolidWorks design and hands-on prototyping and fabrication.";

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
        input: `You are matching a job applicant's resume to a job posting. You must NEVER fabricate or invent connections.

JOB: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}
${jobSummary ? `DESCRIPTION: ${jobSummary}` : ""}

RESUME SKILLS: ${KOHLER_RESUME_SKILLS}

ABSOLUTE RULES — VIOLATION IS FAILURE:
1. A match means the EXACT SAME technical skill appears in both the job posting AND the resume list above
2. "equipment maintenance" is NOT "CNC machining" — DIFFERENT SKILLS, NO MATCH
3. "safety standards" is NOT "FMEA" — DIFFERENT SKILLS, NO MATCH  
4. "operating equipment" is NOT "CNC machining" — DIFFERENT SKILLS, NO MATCH
5. "project management" only matches "Scrum" if the job specifically says "Scrum" or "Agile"
6. If the job description is vague or generic, return ZERO matches
7. If you are not 100% certain a skill is the same on both sides, DO NOT include it
8. It is better to return zero matches than to fabricate one

Return ONLY JSON (no markdown, no backticks):
- If 2+ genuine matches exist: {"sentence":"I have experience with [matched skills].","matches":[{"job_skill":"exact term from job","resume_skill":"exact term from resume"}]}
- If fewer than 2 genuine matches: {"sentence":"${DEFAULT_SKILL}","matches":[]}

The sentence must be under 20 words and start with "I have experience with".`,
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
