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
        input: `Search for current engineering job openings at "${companyname}". Search multiple sources: the company's careers page, Indeed, LinkedIn, Glassdoor, and ZipRecruiter. Try searching "${companyname} engineer jobs" and "${companyname} careers".

Location: Colorado preferred, but include remote positions and nearby states if Colorado results are limited.

INCLUDE: Any engineering role — mechanical, design, manufacturing, test, project, systems, field, process, quality, structural, reliability, environmental, electrical, civil, chemical, petroleum, or related. Include both entry-level AND mid-level (Engineer I, II). Only EXCLUDE Senior/Lead/Principal/Staff/Manager/Director/VP or 8+ years required.

For each job, extract the required technical skills from the posting.

Return ONLY a JSON array (no markdown, no backticks):
[{"title":"exact title","salary":"range or empty string","location":"city, state","summary":"1 sentence role description; required skills: [skill1, skill2, skill3]","apply_url":"real URL to the actual job posting","source":"domain name"}]

If genuinely no engineering jobs found at this company anywhere, return [].
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
          .slice(0, 8);
      }
    } catch { /* parse failed */ }

    return NextResponse.json({ jobs, source: "live" });
  } catch (e) {
    console.error("search-jobs error:", e);
    return NextResponse.json({ jobs: [], source: "error" });
  }
}
