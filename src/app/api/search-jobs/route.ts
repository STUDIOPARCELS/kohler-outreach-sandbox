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
        input: `Search for ENTRY-LEVEL engineering jobs at "${companyname}" in Denver/Boulder/Colorado Front Range area.

LEVEL FILTER — STRICT:
INCLUDE: Engineer I, Engineer 1, Associate Engineer, Junior Engineer, Entry-Level Engineer, Early Career, New Grad, 0-2 years experience
EXCLUDE: Engineer II, Engineer III, Engineer 2, Engineer 3, Senior, Lead, Principal, Staff, Manager, Director, or anything requiring 3+ years experience. Level II and Level III are MID-LEVEL positions — exclude them.

ROLE FILTER: mechanical engineer, design engineer, manufacturing engineer, test engineer, project engineer, systems engineer, field engineer, quality engineer, structural engineer, or similar BSME-applicable roles.

For each job found, include the REQUIRED TECHNICAL SKILLS from the job posting (e.g., "SolidWorks, GD&T, FEA" or "CNC, welding, blueprint reading").

Return ONLY a JSON array (no markdown, no backticks):
[{"title":"exact title","salary":"range or empty","location":"city, state","summary":"1 sentence + key required skills: [skill1, skill2, skill3]","apply_url":"real URL","source":"domain"}]

If no entry-level (Level I / new grad) engineering jobs found, return [].
ONLY the JSON array.`,
        text: { format: { type: "text" } },
      }),
    });

    if (!res.ok) {
      console.error("OpenAI error:", res.status);
      return NextResponse.json({ jobs: [], source: "api_error" });
    }

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
        // Hard filter: reject II, III, 2, 3, Senior, Lead, Principal, Staff, Manager
        const rejectPattern = /\b(senior|sr\.?\s|lead\s|principal|staff\s|manager|director|supervisor|chief|vp\b|vice president)\b|\bII\b|\bIII\b|\bIV\b|\bLevel\s*[2-4]\b|\bEngineer\s*[2-4]\b/i;
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
