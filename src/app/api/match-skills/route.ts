import { NextRequest, NextResponse } from "next/server";

const KOHLER_RESUME = `TECHNICAL SKILLS:
- CAD: SolidWorks (parts, assemblies, drawings)
- Tolerancing: GD&T, tolerance stack-ups, DFM/DFA
- Simulation: FEA (linear static, buckling), CFD (SolidWorks Flow Simulation)
- Fabrication: CNC machining (router, mill, laser, waterjet, plasma), MIG welding, 3D printing (FDM, SLA)
- Programming: MATLAB, Python, C++, Arduino
- Methods: FMEA, Scrum (sprints, backlog, standups)
- Other: LaTeX, technical documentation

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
  if (!apiKey) return NextResponse.json({ sentence: DEFAULT_SKILL, source: "default" });

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "o3",
        input: `You must match an applicant's resume skills to a specific job's requirements.

STEP 1: Read the job posting below and identify the top 2-3 required technical skills.
STEP 2: Find the 2-3 skills from the resume that BEST overlap with those requirements.
STEP 3: Write ONE sentence naming only those 2-3 overlapping skills.

JOB POSTING:
Title: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}
${jobSummary ? `Description: ${jobSummary}` : ""}

APPLICANT RESUME:
${KOHLER_RESUME}

RULES:
- Exactly ONE sentence, 15-20 words max
- Start with "I have experience with"
- Name only 2-3 skills that appear BOTH on the resume AND in the job requirements
- Use the specific skill names from the resume (e.g. "SolidWorks" not "CAD software")
- No school names, no lab names, no project names
- No em dashes, no semicolons
- Output ONLY the sentence`,
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
