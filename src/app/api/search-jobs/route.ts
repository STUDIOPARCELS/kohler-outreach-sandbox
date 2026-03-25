import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

function googleSearchUrl(company: string, title: string): string {
  const q = `"${company}" "${title}" job apply`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export async function POST(req: NextRequest) {
  const { companyname } = await req.json();
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ jobs: [], source: "no_key" });

  const { data: companyRow } = await supabaseAdmin
    .from("companies")
    .select("careers_url")
    .eq("companyname", companyname)
    .single();

  const careersUrl = companyRow?.careers_url || null;

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        tools: [{ type: "web_search_preview" }],
        input: `Search for current engineering job openings at "${companyname}" in Colorado.
${careersUrl ? `Check their careers page: ${careersUrl}` : ""}
Also search Indeed, LinkedIn, and Glassdoor for "${companyname} engineer jobs Colorado".

INCLUDE: Any engineering role — mechanical, design, manufacturing, test, project, systems, field, process, quality, structural, reliability, environmental, electrical, civil, chemical, petroleum, or related. Include Engineer I, entry-level, early career, new grad, associate, junior, or 0-3 years experience.
EXCLUDE: Engineer II, Engineer III, Senior, Lead, Principal, Staff, Manager, Director, VP, or 5+ years required.

Do NOT include any URLs. I will generate links separately.

Return ONLY a JSON array (no markdown, no backticks):
[{"title":"exact title","salary":"range or empty string","location":"city, state","summary":"1 sentence; required skills: [skill1, skill2]","source":"website where found"}]

If no engineering jobs found, return [].
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
        const rejectPattern = /\b(senior|sr\.?\s|lead\s|principal|staff\s|manager|director|supervisor|chief|vp\b|vice president)\b|\bII\b|\bIII\b|\bIV\b/i;
        jobs = parsed
          .filter((j: Record<string, unknown>) => j.title && !rejectPattern.test(j.title as string))
          .slice(0, 8)
          .map((j: Record<string, unknown>) => ({
            title: (j.title as string) || "",
            salary: (j.salary as string) || "",
            location: (j.location as string) || "",
            summary: (j.summary as string) || "",
            apply_url: googleSearchUrl(companyname, (j.title as string) || "engineer"),
            source: (j.source as string) || "",
          }));
      }
    } catch { /* parse failed */ }

    return NextResponse.json({ jobs, careers_url: careersUrl, source: "live" });
  } catch (e) {
    console.error("search-jobs error:", e);
    return NextResponse.json({ jobs: [], source: "error" });
  }
}
