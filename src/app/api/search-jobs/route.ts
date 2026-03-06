import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { companyname } = await req.json();
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ jobs: [], source: "no_key" });

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        tools: [{ type: "web_search_preview" }],
        input: `Search for engineering job openings at "${companyname}" in Denver/Boulder/Colorado Front Range area.

INCLUDE these roles: Engineer I, Engineer II, Mechanical Engineer, Design Engineer, Manufacturing Engineer, Test Engineer, Project Engineer, Systems Engineer, Field Engineer, Quality Engineer, Structural Engineer, Applications Engineer, R&D Engineer, Build Engineer, Process Engineer, or any engineering role a BSME graduate could realistically apply to.

EXCLUDE ONLY: Senior Engineer, Lead Engineer, Principal Engineer, Staff Engineer, Engineering Manager, Director, VP, or anything explicitly requiring 8+ years experience.

For each job, extract the REQUIRED TECHNICAL SKILLS listed in the job posting (tools, software, methods). This is critical.

Return ONLY a JSON array (no markdown, no backticks):
[{"title":"exact title","salary":"range or empty","location":"city, state","summary":"1 sentence role description; required skills: [skill1, skill2, skill3]","apply_url":"real URL to the job posting","source":"domain"}]

If no engineering jobs found at this company in Colorado, return [].
ONLY the JSON array.`,
        text: { format: { type: "text" } },
      }),
    });

    if (!res.ok) return NextResponse.json({ jobs: [], source: "api_error" });

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

    let jobs: { title: string; salary: string; location: string; summary: string; apply_url: string; source: string }[] = [];
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        const rejectPattern = /\b(senior|sr\.?\s|lead\s|principal|staff\s|manager|director|supervisor|chief|vp\b|vice president)\b/i;
        jobs = parsed
          .filter((j: Record<string, unknown>) => j.title && j.apply_url && !rejectPattern.test(j.title as string))
          .slice(0, 6);
      }
    } catch { /* parse failed */ }

    return NextResponse.json({ jobs, source: "live" });
  } catch (e) {
    console.error("search-jobs error:", e);
    return NextResponse.json({ jobs: [], source: "error" });
  }
}
// clean rebuild 1772831531
