import { NextRequest, NextResponse } from "next/server";

const KOHLER_RESUME = `TECHNICAL SKILLS:
- CAD: SolidWorks (parts, assemblies, drawings)
- Tolerancing: GD&T, tolerance stack-ups, DFM/DFA
- Simulation: FEA (linear static, buckling), CFD (SolidWorks Flow Simulation)
- Fabrication: CNC machining (router, mill, laser, waterjet, plasma), MIG welding, 3D printing (FDM, SLA)
- Programming: MATLAB, Python, C++, Arduino
- Methods: FMEA, Scrum (sprints, backlog, standups)

PROJECT EXPERIENCE:
- Designed adaptive bass guitar plucking mechanism (capstone) — SolidWorks, prototyping, testing
- Designed player stabilization system — mechanical design, fabrication
- Fabricated mono-ski for Special Olympics — hands-on manufacturing
- Steel railing layout, fabrication, and installation
- Woodworking design and CNC router fabrication`;

const DEFAULT_SKILL = "I have experience with SolidWorks design and hands-on CNC machining and fabrication.";

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
        input: `You must match an applicant's resume skills to a job posting's requirements. Return JSON only.

JOB POSTING:
Title: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}
${jobSummary ? `Description: ${jobSummary}` : ""}

APPLICANT RESUME:
${KOHLER_RESUME}

INSTRUCTIONS:
1. Identify the top 2-3 required technical skills from the job posting
2. Find the 2-3 resume skills that best overlap
3. Write ONE sentence (15-20 words max) starting with "I have experience with" naming only those overlapping skills
4. List the matched pairs

Return ONLY this JSON (no markdown, no backticks):
{"sentence":"I have experience with ...","matches":[{"job_skill":"skill from job","resume_skill":"matching skill from resume"}]}`,
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
    } catch { /* parse failed, try extracting sentence */ }

    // Fallback: try to get just the sentence
    const sentenceMatch = text.match(/I have experience[^.]+\./i);
    if (sentenceMatch) {
      return NextResponse.json({ sentence: sentenceMatch[0], matches: [], source: "gpt54_partial" });
    }

    return NextResponse.json({ sentence: DEFAULT_SKILL, matches: [], source: "fallback" });
  } catch {
    return NextResponse.json({ sentence: DEFAULT_SKILL, matches: [], source: "error" });
  }
}
