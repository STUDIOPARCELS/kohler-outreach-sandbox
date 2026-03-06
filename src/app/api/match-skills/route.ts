import { NextRequest, NextResponse } from "next/server";

const KOHLER_SKILLS = `CAD: SolidWorks (parts, assemblies, drawings), GD&T, tolerance stack-ups, DFM/DFA
Simulation: FEA linear static and buckling analysis, CFD via SolidWorks Flow Simulation
Fabrication: CNC router, CNC mill, laser cutter, waterjet, plasma cutter, MIG welding, FDM and SLA 3D printing
Design: Redesigned adaptive bass guitar plucking mechanism (capstone), designed player stabilization system, mono-ski fabrication for Special Olympics
Methods: FMEA, Scrum (sprints, backlog, standups), engineering project management
Programming: MATLAB, Python, C++, Arduino, LaTeX
Other: Steel railing layout/fabrication/installation, woodworking design and CNC fabrication`;

export async function POST(req: NextRequest) {
  const { jobTitle, jobSummary, companyName } = await req.json();
  if (!jobTitle) return NextResponse.json({ error: "jobTitle required" }, { status: 400 });

  const fallback = "I have experience taking SolidWorks designs from concept through prototype and fabrication.";

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ sentence: fallback });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 80,
        messages: [{
          role: "user",
          content: `Write ONE sentence for a cover letter. The applicant is Kohler Wood, entry-level BSME/EIT.

His actual skills from his resume:
${KOHLER_SKILLS}

The job posting: "${jobTitle}" at ${companyName || "this company"}.
${jobSummary ? `Description: ${jobSummary.slice(0, 300)}` : ""}

Rules:
- Write exactly ONE sentence, under 25 words
- Start with "I have experience"
- Connect his MOST relevant resume skill to THIS specific role
- Be specific (name the actual skill/tool from his resume)
- Do NOT mention any school, lab, or facility names
- Do NOT use em dashes
- Output ONLY the sentence, no quotes, no explanation`
        }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Anthropic API error:", res.status, errText);
      return NextResponse.json({ sentence: fallback, debug: `API ${res.status}` });
    }

    const data = await res.json();
    let sentence = (data.content?.[0]?.text || "").trim();
    // Strip any quotes the model might add
    sentence = sentence.replace(/^["']|["']$/g, "").trim();
    if (!sentence || !sentence.toLowerCase().startsWith("i have")) {
      return NextResponse.json({ sentence: fallback, aiRaw: sentence || "(empty)" });
    }
    return NextResponse.json({ sentence });
  } catch (e) {
    console.error("match-skills error:", e);
    return NextResponse.json({ sentence: fallback, debug: String(e) });
  }
}
