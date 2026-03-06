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
        input: `Search for mechanical engineer, design engineer, manufacturing engineer, or similar engineering job openings at "${companyname}" in the Denver/Boulder/Colorado Front Range area.

INCLUDE positions like: Engineer I, Engineer II, Mechanical Engineer, Design Engineer, Manufacturing Engineer, Test Engineer, Project Engineer, Applications Engineer, Field Engineer, or any engineering role a recent BSME graduate could apply to. These do NOT need to say "entry level" — most companies don't label them that way.

EXCLUDE: Senior Engineer, Lead Engineer, Principal Engineer, Staff Engineer, Engineering Manager, Director, VP, or anything requiring 7+ years experience.

Return ONLY a JSON array (no markdown, no backticks) of up to 5 jobs. Each object:
- "title": exact job title from the posting
- "salary": salary range if found, or ""
- "location": city, state
- "summary": 1 sentence describing the role and key responsibilities
- "apply_url": direct URL to the job posting (real working link)
- "source": website domain

If truly no engineering jobs found at this company in Colorado, return [].
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
        // Filter out clearly senior roles that slipped through
        const seniorPattern = /\b(senior|sr\.?\s|lead\s|principal|staff\s|manager|director|supervisor|chief|vp\b|vice president)\b/i;
        jobs = parsed
          .filter((j: Record<string, unknown>) => j.title && j.apply_url && !seniorPattern.test(j.title as string))
          .slice(0, 6);
      }
    } catch { /* parse failed */ }

    return NextResponse.json({ jobs, source: "live" });
  } catch (e) {
    console.error("search-jobs error:", e);
    return NextResponse.json({ jobs: [], source: "error" });
  }
}
