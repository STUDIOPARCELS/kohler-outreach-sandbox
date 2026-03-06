import { NextRequest, NextResponse } from "next/server";

const KOHLER_RESUME_SKILLS = `EXACT SKILLS ON RESUME (use these exact terms only):
- SolidWorks (parts, assemblies, drawings)
- GD&T
- Tolerance stack-ups
- DFM/DFA
- FEA (linear static, buckling)
- CFD (SolidWorks Flow Simulation)
- CNC machining
- MIG welding
- 3D printing (FDM, SLA)
- Laser cutting
- Waterjet cutting
- Plasma cutting
- MATLAB
- Python
- C++
- Arduino
- FMEA
- Scrum`;

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
        input: `Match a job posting's REQUIRED SKILLS to an applicant's EXACT resume skills. Be extremely strict.

JOB POSTING:
Title: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}
${jobSummary ? `Description: ${jobSummary}` : ""}

APPLICANT'S EXACT RESUME SKILLS:
${KOHLER_RESUME_SKILLS}

STRICT RULES:
1. Read the job posting and identify 2-3 specific required technical skills
2. For EACH job skill, check if the resume has a DIRECT match (same skill, same tool, same method)
3. If a job skill has NO direct match on the resume, DO NOT include it. Skip it entirely.
4. Only include matches where the resume skill is genuinely the same thing as the job requirement
5. "equipment maintenance" does NOT match "CNC machining" — those are different skills
6. "safety standards" does NOT match "FMEA" unless the job specifically says FMEA
7. Only match when you can point to the EXACT SAME skill name on both sides

Return ONLY this JSON (no markdown, no backticks):
{"sentence":"I have experience with [2-3 matched skills from resume].","matches":[{"job_skill":"exact skill from job posting","resume_skill":"exact matching skill from resume"}]}

The sentence must be under 20 words, start with "I have experience with", and name ONLY skills that appear on the resume using the resume's exact terminology.

If fewer than 2 skills match, use: {"sentence":"I have experience with SolidWorks design and hands-on prototyping and fabrication.","matches":[]}`,
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

    const sentenceMatch = text.match(/I have experience[^.]+\./i);
    if (sentenceMatch) {
      return NextResponse.json({ sentence: sentenceMatch[0], matches: [], source: "gpt54_partial" });
    }

    return NextResponse.json({ sentence: DEFAULT_SKILL, matches: [], source: "fallback" });
  } catch {
    return NextResponse.json({ sentence: DEFAULT_SKILL, matches: [], source: "error" });
  }
}
