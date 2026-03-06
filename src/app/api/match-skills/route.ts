import { NextRequest, NextResponse } from "next/server";

const KOHLER_SKILLS = [
  "SolidWorks", "GD&T", "tolerance stack-ups", "DFM/DFA",
  "FEA", "CFD (SolidWorks Flow Simulation)",
  "CNC machining", "MIG welding", "3D printing",
  "laser cutting", "waterjet", "plasma cutting",
  "MATLAB", "Python", "C++", "Arduino", "FMEA", "Scrum"
];

const DEFAULT_SENTENCE = "I have hands-on experience in mechanical design, prototyping, and fabrication, with skills in SolidWorks, CNC machining, and 3D printing.";

export async function POST(req: NextRequest) {
  const { jobTitle, jobSummary, companyName } = await req.json();
  if (!jobTitle) return NextResponse.json({ error: "jobTitle required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ sentence: DEFAULT_SENTENCE, matches: [], source: "default" });

  try {
    // Step 1: AI identifies skill matches only
    const matchRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5.4-2026-03-05",
        input: `You are a skill matcher. Return ONLY a JSON array of matched skill pairs.

JOB: "${jobTitle}" ${companyName ? `at ${companyName}` : ""}
${jobSummary ? `DESCRIPTION: ${jobSummary}` : ""}

RESUME SKILLS: ${KOHLER_SKILLS.join(", ")}

Match rules:
- "CAD" → "SolidWorks"
- "tolerance analysis" → "tolerance stack-ups"
- "finite element" → "FEA"
- "additive manufacturing" → "3D printing"
- "machining"/"CNC" → "CNC machining"
- "welding" → "MIG welding"
- "fabrication" (hands-on) → "CNC machining"
- Do NOT match vague terms like "safety", "maintenance", "operating equipment"

Return ONLY JSON array: [{"job_skill":"from job","resume_skill":"from resume"}]
If no matches: []`,
        text: { format: { type: "text" } },
      }),
    });

    let matches: { job_skill: string; resume_skill: string }[] = [];
    if (matchRes.ok) {
      const matchData = await matchRes.json();
      let matchText = "";
      if (matchData.output) {
        for (const item of matchData.output) {
          if (item.type === "message" && item.content) {
            for (const c of item.content) {
              if (c.type === "output_text") matchText += c.text;
            }
          }
        }
      }
      try {
        const cleaned = matchText.replace(/```json\n?|\n?```/g, "").trim();
        matches = JSON.parse(cleaned);
        if (!Array.isArray(matches)) matches = [];
        matches = matches.filter(m =>
          KOHLER_SKILLS.some(s => s.toLowerCase() === (m.resume_skill || "").toLowerCase())
        );
      } catch { matches = []; }
    }

    if (matches.length < 2) {
      return NextResponse.json({ sentence: DEFAULT_SENTENCE, matches: [], source: "default" });
    }

    // Step 2: Build skill list, then ask AI to write ONE natural sentence using ONLY these skills
    const matchedSkills = Array.from(new Set(matches.map(m => m.resume_skill)));
    const sentenceRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5.4-2026-03-05",
        input: `Write ONE sentence for a cover letter. The applicant has these verified skills: ${matchedSkills.join(", ")}.

RULES:
- Start with "I have experience with"
- Name the skills listed above using those exact terms
- Add brief context like "from concept through prototype" or "for precision mechanical assemblies"
- 15-25 words total
- NEVER mention any school, lab, facility, company, industry, or sector
- NEVER say "capstone", "senior project", "coursework", "academic"
- NEVER add skills beyond what is listed above
- Output ONLY the sentence, nothing else`,
        text: { format: { type: "text" } },
      }),
    });

    let sentence = DEFAULT_SENTENCE;
    if (sentenceRes.ok) {
      const sentData = await sentenceRes.json();
      let sentText = "";
      if (sentData.output) {
        for (const item of sentData.output) {
          if (item.type === "message" && item.content) {
            for (const c of item.content) {
              if (c.type === "output_text") sentText += c.text;
            }
          }
        }
      }
      sentText = sentText.trim().replace(/^["']|["']$/g, "");
      if (sentText.toLowerCase().startsWith("i have")) {
        sentence = sentText;
      }
    }

    return NextResponse.json({ sentence, matches, source: "gpt54" });
  } catch {
    return NextResponse.json({ sentence: DEFAULT_SENTENCE, matches: [], source: "error" });
  }
}
