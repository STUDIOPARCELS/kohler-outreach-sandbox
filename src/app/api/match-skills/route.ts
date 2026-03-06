import { NextRequest, NextResponse } from "next/server";

// Kohler's actual resume skills mapped to job keywords
const SKILL_MAP: [RegExp, string][] = [
  // Power / Energy / Nuclear
  [/power|energy|nuclear|steam|turbine|boiler|generat|combustion/i,
    "I have experience with SolidWorks, CFD flow simulation, and mechanical system design from concept through fabrication."],
  // Aerospace / Space / Defense
  [/aerospace|space|satellite|rocket|missile|defense|propulsion|guidance|orbit/i,
    "I have experience with SolidWorks modeling, FEA simulation, and GD&T for precision mechanical assemblies."],
  // HVAC / MEP / Building systems
  [/hvac|mep|plumbing|piping|duct|building\s*system|commissioning|retrofit/i,
    "I have experience with SolidWorks, CFD flow simulation, and mechanical system design from concept through installation."],
  // Manufacturing / Production / CNC
  [/manufactur|production|cnc|machining|fabricat|weld|assembly line|quality|inspect/i,
    "I have hands-on experience with CNC machining, MIG welding, and taking SolidWorks designs through prototype and production."],
  // Structural / Analysis / FEA
  [/structural|stress|analysis|fea|finite element|fatigue|load|vibrat/i,
    "I have experience with FEA linear static and buckling analysis in SolidWorks and mechanical design validation."],
  // Design / R&D / Product development
  [/design|r&d|product\s*develop|prototyp|concept|innovat|new\s*product/i,
    "I have experience with SolidWorks parts, assemblies, and drawings, plus hands-on CNC and 3D printing prototyping."],
  // Project / Field / Construction
  [/project\s*eng|field|construction|site|estimat|superintendent|coord/i,
    "I have hands-on fabrication experience, Scrum project management skills, and a strong mechanical design foundation."],
  // Water / Environmental / Civil
  [/water|wastewater|treatment|environ|civil|infrastruc|dam|tunnel|bridge/i,
    "I have experience with SolidWorks, mechanical system design, and taking CAD concepts through prototype and fabrication."],
  // Robotics / Automation / Controls
  [/robot|automat|control|plc|sensor|actuator|mechatron|arduino/i,
    "I have experience with Arduino, MATLAB, SolidWorks, and taking electromechanical designs from concept through prototype."],
  // Medical / Biotech
  [/medical|biotech|biomedic|implant|surgical|device|pharma|health/i,
    "I have experience with SolidWorks, GD&T, DFM/DFA, and taking precision designs from concept through prototype."],
];

const DEFAULT_SKILL = "I have experience taking SolidWorks designs from concept through prototype and fabrication.";

export async function POST(req: NextRequest) {
  const { jobTitle, jobSummary, companyName } = await req.json();
  if (!jobTitle) return NextResponse.json({ error: "jobTitle required" }, { status: 400 });

  const combined = `${jobTitle} ${jobSummary || ""} ${companyName || ""}`;

  // Try AI first if key exists
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && apiKey.length > 10) {
    try {
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
            content: `Write ONE sentence for a cover letter. Applicant: entry-level BSME/EIT.

Skills: SolidWorks (parts/assemblies/drawings), GD&T, tolerance stack-ups, DFM/DFA, FEA, CFD, CNC machining, MIG welding, 3D printing (FDM/SLA), laser/waterjet/plasma cutting, MATLAB, Python, C++, Arduino, FMEA, Scrum.

Job: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}.
${jobSummary ? `Desc: ${jobSummary.slice(0, 200)}` : ""}

Rules: ONE sentence, under 25 words. Start with "I have experience". Name specific skills from above that match this job. No school/lab names. No em dashes. Output ONLY the sentence.`
          }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        let sentence = (data.content?.[0]?.text || "").trim().replace(/^["']|["']$/g, "");
        if (sentence.toLowerCase().startsWith("i have")) {
          return NextResponse.json({ sentence, source: "ai" });
        }
      }
    } catch { /* fall through to deterministic */ }
  }

  // Deterministic fallback: match job keywords to best skill sentence
  for (const [pattern, sentence] of SKILL_MAP) {
    if (pattern.test(combined)) {
      return NextResponse.json({ sentence, source: "match" });
    }
  }

  return NextResponse.json({ sentence: DEFAULT_SKILL, source: "default" });
}
