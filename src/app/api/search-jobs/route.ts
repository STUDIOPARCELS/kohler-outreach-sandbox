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
        input: `Search for ENTRY-LEVEL mechanical engineer job openings at "${companyname}" in Denver, Colorado area (within 50 miles).

CRITICAL FILTER: Only return positions that are entry-level, junior, associate, Engineer I, Engineer II, early career, new grad, or 0-3 years experience. 

DO NOT return any position that says Senior, Lead, Principal, Staff, Manager, Director, or requires 5+ years experience.

Return ONLY a JSON array (no markdown, no backticks, no explanation) of up to 5 qualifying jobs. Each object:
- "title": exact job title
- "salary": salary range if found, or ""
- "location": city, state
- "summary": 1 sentence about the role
- "apply_url": direct URL to the job posting
- "source": domain name

If no entry-level engineer jobs found at this company, return [].
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
        // Double-check: filter out senior/lead/principal titles that slipped through
        const seniorPattern = /\b(senior|sr\.?|lead|principal|staff|manager|director|supervisor|chief|head of|vp|vice president)\b/i;
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
