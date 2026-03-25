import { NextRequest, NextResponse } from "next/server";

/* ── Validate a URL by issuing a HEAD request (fast, no body download) ── */
async function isUrlLive(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JobCheck/1.0)" },
    });
    clearTimeout(timer);
    return res.ok || res.status === 403; // 403 often means page exists but blocks bots
  } catch {
    return false;
  }
}

/* ── Build a Google search fallback when a direct URL is dead ── */
function googleSearchUrl(company: string, title: string): string {
  const q = `${company} "${title}" job apply`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export async function POST(req: NextRequest) {
  const { companyname } = await req.json();
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ jobs: [], source: "no_key" });

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        tools: [{ type: "web_search_preview" }],
        input: `Search for current engineering job openings at "${companyname}". Search multiple sources: the company's careers page, Indeed, LinkedIn, Glassdoor, and ZipRecruiter. Try searching "${companyname} engineer jobs" and "${companyname} careers".

Location: Colorado preferred, but include remote positions and nearby states if Colorado results are limited.

INCLUDE: Any engineering role — mechanical, design, manufacturing, test, project, systems, field, process, quality, structural, reliability, environmental, electrical, civil, chemical, petroleum, or related. Include Engineer I, entry-level, early career, new grad, associate, junior, or 0-3 years experience. EXCLUDE: Engineer II, Engineer III, Senior, Lead, Principal, Staff, Manager, Director, VP, or 5+ years required.

For each job, extract the required technical skills from the posting.

CRITICAL: For apply_url, only use URLs you actually found in your web search results. Do NOT construct or guess URLs. If you cannot find the direct URL for a specific posting, use the company careers page URL instead. Never fabricate a URL.

Return ONLY a JSON array (no markdown, no backticks):
[{"title":"exact title","salary":"range or empty string","location":"city, state","summary":"1 sentence role description; required skills: [skill1, skill2, skill3]","apply_url":"real URL from your search results","source":"domain name"}]

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
            if (c.type === "output_text") {
              text += c.text;
            }
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
          .slice(0, 8);
      }
    } catch { /* parse failed */ }

    /* ── Validate URLs in parallel, replace dead ones with Google search ── */
    const validated = await Promise.all(
      jobs.map(async (job) => {
        if (job.apply_url && job.apply_url.startsWith("http")) {
          const live = await isUrlLive(job.apply_url);
          if (!live) {
            return {
              ...job,
              apply_url: googleSearchUrl(companyname, job.title),
              source: (job.source || "") + " (search)",
            };
          }
        } else {
          return {
            ...job,
            apply_url: googleSearchUrl(companyname, job.title),
            source: "search",
          };
        }
        return job;
      })
    );

    return NextResponse.json({ jobs: validated, source: "live" });
  } catch (e) {
    console.error("search-jobs error:", e);
    return NextResponse.json({ jobs: [], source: "error" });
  }
}
