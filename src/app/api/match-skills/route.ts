import { NextRequest, NextResponse } from "next/server";

const KOHLER_SKILLS = `SolidWorks (parts/assemblies/drawings), GD&T, tolerance stack-ups, DFM/DFA, FEA linear static and buckling, CFD SolidWorks Flow Simulation, CNC machining (router/mill/laser/waterjet/plasma), MIG welding, FDM/SLA 3D printing, MATLAB, Python, C++, Arduino, FMEA, Scrum project management`;

// Deterministic fallback
const SKILL_MAP: [RegExp, string][] = [
  [/power|energy|nuclear|steam|turbine|boiler|generat/i, "I have experience with SolidWorks, CFD flow simulation, and mechanical system design from concept through fabrication."],
  [/aerospace|space|satellite|rocket|missile|defense|propulsion|guidance/i, "I have experience with SolidWorks modeling, FEA simulation, and GD&T for precision mechanical assemblies."],
  [/hvac|mep|plumbing|piping|building\s*system|commissioning/i, "I have experience with SolidWorks, CFD flow simulation, and mechanical system design from concept through installation."],
  [/manufactur|production|cnc|machining|fabricat|weld|quality/i, "I have hands-on experience with CNC machining, MIG welding, and taking SolidWorks designs through prototype and production."],
  [/structural|stress|analysis|fea|finite element/i, "I have experience with FEA linear static and buckling analysis in SolidWorks and mechanical design validation."],
  [/design|r&d|product\s*develop|prototyp|concept/i, "I have experience with SolidWorks parts, assemblies, and drawings, plus hands-on CNC and 3D printing prototyping."],
  [/project\s*eng|field|construction|site|estimat/i, "I have hands-on fabrication experience, Scrum project management skills, and a strong mechanical design foundation."],
  [/water|wastewater|environ|civil|infrastruc/i, "I have experience with SolidWorks, mechanical system design, and taking CAD concepts through prototype and fabrication."],
  [/robot|automat|control|plc|sensor|mechatron/i, "I have experience with Arduino, MATLAB, SolidWorks, and taking electromechanical designs from concept through prototype."],
  [/medical|biotech|device|surgical|implant/i, "I have experience with SolidWorks, GD&T, DFM/DFA, and taking precision designs from concept through prototype."],
];
const DEFAULT_SKILL = "I have experience taking SolidWorks designs from concept through prototype and fabrication.";

export async function POST(req: NextRequest) {
  const { jobTitle, jobSummary, companyName } = await req.json();
  if (!jobTitle) return NextResponse.json({ error: "jobTitle required" }, { status: 400 });

  const combined = `${jobTitle} ${jobSummary || ""} ${companyName || ""}`;

  // Try OpenAI first
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          max_tokens: 80,
          messages: [{
            role: "user",
            content: `Write ONE sentence for a cover letter. Applicant: entry-level BSME/EIT.

Skills: ${KOHLER_SKILLS}

Job: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}.
${jobSummary ? `Desc: ${jobSummary.slice(0, 200)}` : ""}

Rules: ONE sentence, under 25 words. Start with "I have experience". Name specific skills from above that match this job. No school/lab names. No em dashes. Output ONLY the sentence.`
          }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        let sentence = (data.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
        if (sentence.toLowerCase().startsWith("i have")) {
          return NextResponse.json({ sentence, source: "openai" });
        }
      }
    } catch { /* fall through */ }
  }

  // Deterministic fallback
  for (const [pattern, sentence] of SKILL_MAP) {
    if (pattern.test(combined)) return NextResponse.json({ sentence, source: "match" });
  }
  return NextResponse.json({ sentence: DEFAULT_SKILL, source: "default" });
}
