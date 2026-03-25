import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

/* ── Build direct job board search URLs instead of useless Google search ── */
function indeedSearchUrl(company: string): string {
  return `https://www.indeed.com/jobs?q=${encodeURIComponent(company + " engineer")}&l=Colorado`;
}

function linkedinSearchUrl(company: string): string {
  return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(company + " engineer")}&location=Colorado`;
}

/* ── Check if a URL looks like a real job posting (not fabricated) ── */
function isRealJobUrl(url: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  // Real indeed URLs have hex job keys
  if (url.includes("indeed.com/viewjob") && /jk=[0-9a-f]{10,}/.test(url)) return true;
  // Real LinkedIn job URLs have numeric IDs
  if (url.includes("linkedin.com/jobs/view/") && /\/\d{8,}/.test(url)) return true;
  // Real Glassdoor URLs
  if (url.includes("glassdoor.com/job-listing")) return true;
  // Company careers pages
  if (url.includes("/careers") || url.includes("/jobs") || url.includes("greenhouse.io") || url.includes("lever.co") || url.includes("workday")) return true;
  return false;
}

export async function POST(req: NextRequest) {
  const { companyname } = await req.json();
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ jobs: [], source: "no_key" });

  // Pull the careers_url from the database as fallback
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

Search these sources and return the ACTUAL URL from your search results for each job:
1. Indeed: search "${companyname} engineer jobs Colorado site:indeed.com"
2. LinkedIn: search "${companyname} engineer jobs Colorado site:linkedin.com/jobs"
3. Company careers page${careersUrl ? `: ${careersUrl}` : ""}

INCLUDE: Any engineering role — mechanical, design, manufacturing, test, project, systems, field, process, quality, structural, reliability, environmental, electrical, civil, chemical, petroleum, or related. Include Engineer I, entry-level, early career, new grad, associate, junior, or 0-3 years experience.
EXCLUDE: Engineer II, Engineer III, Senior, Lead, Principal, Staff, Manager, Director, VP, or 5+ years required.

CRITICAL: For apply_url, ONLY use URLs that appeared in your web search results. Each must link to the SPECIFIC JOB POSTING page. If you cannot find a direct link, leave apply_url as an empty string.

Return ONLY a JSON array (no markdown, no backticks):
[{"title":"exact title","salary":"range or empty string","location":"city, state","summary":"1 sentence; required skills: [skill1, skill2]","apply_url":"direct URL to this specific job posting or empty string","source":"indeed.com or linkedin.com etc"}]

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
          .map((j: Record<string, unknown>) => {
            let url = String(j.apply_url || "");
            let source = String(j.source || "");

            // Only keep URLs that look like real job postings
            if (!isRealJobUrl(url)) {
              // Fallback priority: careers page > Indeed search > LinkedIn search
              if (careersUrl) {
                url = careersUrl;
                source = "careers page";
              } else {
                url = indeedSearchUrl(companyname);
                source = "Indeed search";
              }
            }

            return {
              title: String(j.title || ""),
              salary: String(j.salary || ""),
              location: String(j.location || ""),
              summary: String(j.summary || ""),
              apply_url: url,
              source,
            };
          });
      }
    } catch { /* parse failed */ }

    return NextResponse.json({ jobs, careers_url: careersUrl, source: "live" });
  } catch (e) {
    console.error("search-jobs error:", e);
    return NextResponse.json({ jobs: [], source: "error" });
  }
}
