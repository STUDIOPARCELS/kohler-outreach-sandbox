import { NextRequest, NextResponse } from "next/server";

const KOHLER_RESUME = `SKILLS: SolidWorks (parts/assemblies/drawings), GD&T, tolerance stack-ups, DFM/DFA, FEA (linear static, buckling), CFD (SolidWorks Flow Simulation), CNC machining, MIG welding, 3D printing (FDM/SLA), laser cutting, waterjet, plasma cutting, MATLAB, Python, C++, Arduino, FMEA, Scrum
EXPERIENCE: Redesigned adaptive bass guitar plucking mechanism (capstone); designed player stabilization system; fabricated mono-ski for Special Olympics; steel railing layout/fabrication/installation; woodworking design and CNC fabrication`;

const DEFAULT_SKILL = "I have experience with SolidWorks design and hands-on CNC machining and fabrication.";

export async function POST(req: NextRequest) {
  const { jobTitle, jobSummary, companyName } = await req.json();
  if (!jobTitle) return NextResponse.json({ error: "jobTitle required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ sentence: DEFAULT_SKILL, source: "default" });

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "o4-mini",
        input: `You are matching a job applicant's resume to a job posting. Pick the 2-3 skills from the resume that BEST match the job requirements. Write ONE sentence.

RESUME SKILLS:
${KOHLER_RESUME}

JOB: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}
${jobSummary ? `DESCRIPTION: ${jobSummary}` : ""}

RULES:
- Write exactly ONE sentence, 15-20 words max
- Start with "I have experience with"
- Name only 2-3 specific skills that directly match this job's requirements
- Pick from the resume ONLY — do not invent skills
- No school names, no lab names, no facility names
- No em dashes
- Output ONLY the sentence, no quotes, no explanation`,
        text: { format: { type: "text" } },
      }),
    });

    if (!res.ok) return NextResponse.json({ sentence: DEFAULT_SKILL, source: "api_error" });

    const data = await res.json();
    let sentence = "";
    if (data.output) {
      for (const item of data.output) {
        if (item.type === "message" && item.content) {
          for (const c of item.content) {
            if (c.type === "output_text") sentence += c.text;
          }
        }
      }
    }
    sentence = sentence.trim().replace(/^["']|["']$/g, "");
    if (sentence.toLowerCase().startsWith("i have")) {
      return NextResponse.json({ sentence, source: "openai" });
    }
    return NextResponse.json({ sentence: DEFAULT_SKILL, source: "fallback" });
  } catch {
    return NextResponse.json({ sentence: DEFAULT_SKILL, source: "error" });
  }
}
