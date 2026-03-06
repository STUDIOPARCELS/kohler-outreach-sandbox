import { NextRequest, NextResponse } from "next/server";

const KOHLER_SKILLS_LIST = `SolidWorks, GD&T, tolerance stack-ups, DFM/DFA, FEA, CFD (SolidWorks Flow Simulation), CNC machining, MIG welding, 3D printing, laser cutting, waterjet, plasma cutting, MATLAB, Python, C++, Arduino, FMEA, Scrum`;

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
        input: `Match a job posting's required skills to this applicant's resume. Be honest — match real overlaps, reject fake ones.

JOB: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}
${jobSummary ? `DESCRIPTION: ${jobSummary}` : ""}

RESUME SKILLS: ${KOHLER_SKILLS_LIST}

WHAT COUNTS AS A MATCH:
- Job says "SolidWorks" or "CAD" → resume has "SolidWorks" → YES
- Job says "GD&T" → resume has "GD&T" → YES
- Job says "tolerance analysis" → resume has "tolerance stack-ups" → YES
- Job says "FEA" or "finite element" → resume has "FEA" → YES
- Job says "CFD" → resume has "CFD" → YES
- Job says "CNC" or "machining" → resume has "CNC machining" → YES
- Job says "welding" → resume has "MIG welding" → YES
- Job says "3D printing" or "additive" → resume has "3D printing" → YES
- Job says "FMEA" → resume has "FMEA" → YES
- Job says "MATLAB" → resume has "MATLAB" → YES
- Job says "Python" → resume has "Python" → YES
- Job says "fabrication" meaning hands-on metal/wood work → resume has "CNC machining" or "MIG welding" → YES

WHAT DOES NOT COUNT:
- "assembly" ≠ "MIG welding"
- "equipment maintenance" ≠ "CNC machining"
- "operating equipment" ≠ "CNC machining"
- "safety" ≠ "FMEA" unless job specifically says "FMEA"
- "sub-system integration" ≠ "DFM/DFA"
- If the job description is too vague → NO matches

CRITICAL WRITING RULES:
- The sentence must read NATURALLY as a standalone paragraph in a cover letter
- It must flow smoothly — not just a list of two words
- BAD: "I have experience with SolidWorks and FEA." (too short, reads like a fragment)
- GOOD: "I have experience with SolidWorks modeling and FEA simulation, and have taken designs from concept through prototype."
- GOOD: "I have hands-on experience with CNC machining, MIG welding, and 3D printing for prototype fabrication."
- Add brief context that makes the skills feel connected to real work
- 15-25 words, start with "I have"
- Use EXACT resume skill names from the matches

Return ONLY JSON (no markdown):
{"sentence":"I have [natural flowing sentence with matched skills and brief context].","matches":[{"job_skill":"from job","resume_skill":"from resume"}]}

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
