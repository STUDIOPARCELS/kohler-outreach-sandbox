import { NextRequest, NextResponse } from "next/server";

const KOHLER_SKILLS_LIST = `SolidWorks, GD&T, tolerance stack-ups, DFM/DFA, FEA, CFD (SolidWorks Flow Simulation), CNC machining, MIG welding, 3D printing, laser cutting, waterjet, plasma cutting, MATLAB, Python, C++, Arduino, FMEA, Scrum`;

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
        input: `Match a job posting to this applicant's resume skills. Be honest — match real overlaps, reject fake ones.

JOB: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}
${jobSummary ? `DESCRIPTION: ${jobSummary}` : ""}

RESUME SKILLS: ${KOHLER_SKILLS_LIST}

WHAT COUNTS AS A MATCH:
- Job says "SolidWorks" and resume has "SolidWorks" → YES, match
- Job says "GD&T" and resume has "GD&T" → YES, match
- Job says "tolerance analysis" and resume has "tolerance stack-ups" → YES, same skill
- Job says "CAD" and resume has "SolidWorks" → YES, SolidWorks is CAD
- Job says "FEA" or "finite element" and resume has "FEA" → YES, match
- Job says "CFD" and resume has "CFD" → YES, match
- Job says "CNC" or "machining" and resume has "CNC machining" → YES, match
- Job says "welding" and resume has "MIG welding" → YES, match
- Job says "additive manufacturing" or "3D printing" and resume has "3D printing" → YES

WHAT DOES NOT COUNT:
- Job says "equipment maintenance" and resume has "CNC machining" → NO, different
- Job says "safety" and resume has "FMEA" → NO, unless job specifically says "FMEA"
- Job says "operating equipment" and resume has "CNC machining" → NO, operating ≠ machining
- Job says "field work" and resume has anything → NO, no field experience on resume
- If the job description is too vague to identify specific technical skills → NO matches

Return ONLY JSON (no markdown):
{"sentence":"I have experience with [2-3 matched skills].","matches":[{"job_skill":"from job","resume_skill":"from resume"}]}

If fewer than 2 real matches: {"sentence":"${DEFAULT_SKILL}","matches":[]}
Sentence under 20 words, start with "I have experience with".`,
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
