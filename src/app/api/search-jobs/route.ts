import { requireAppOrigin } from "@/lib/auth";
import { getReliableJobUrl, isDirectJobUrl } from "@/lib/jobLinks";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isTodayTargetJob } from "@/lib/targeting";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req); if (authError) return authError;
  const { companyname } = await req.json();
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  // FIRST: check job_listings for existing jobs linked to this company
  const { data: dbJobs } = await supabaseAdmin
    .from("job_listings")
    .select("title, companyname, location, salary, job_url, apply_url, employment_type, source, received_at, is_relevant")
    .eq("companyname", companyname)
    .eq("is_relevant", true)
    .in("ingest_status", ["new", "open"])
    .order("received_at", { ascending: false });

  const targetDbJobs = (dbJobs || [])
    .map((job) => ({ ...job, reliable_url: getReliableJobUrl(job) }))
    .filter((job) =>
      job.reliable_url && isTodayTargetJob({
      title: job.title,
      companyname: job.companyname,
      is_relevant: job.is_relevant,
      job_url: job.reliable_url,
    })
  );

  if (targetDbJobs.length > 0) {
    return NextResponse.json({
      jobs: targetDbJobs.map((j) => ({
        title: j.title,
        location: j.location || "Denver metro",
        salary: j.salary || null,
        url: j.reliable_url || "",
        work_type: j.employment_type || null,
        source: j.source || "database",
      })),
      source: "database",
    });
  }

  // FALLBACK: web search via OpenAI
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

Search the company careers page and its applicant tracking system only${careersUrl ? `, starting here: ${careersUrl}` : ""}.

INCLUDE: Mechanical/EIT-track engineering roles first: mechanical, MEP/HVAC/building systems, aerospace/space hardware, robotics/mechatronics, manufacturing, design, test, project, systems, process, quality, structural, reliability, environmental, water, energy, civil, or related. Include Engineer I, entry-level, early career, new grad, associate, junior, or 0-3 years experience. Prefer roles with PE mentorship, licensed engineering leadership, or a path toward PE. Must require a Bachelor's degree in engineering or related field.
EXCLUDE: Engineer II, Engineer III, Senior, Lead, Principal, Staff, Manager, Director, VP, or 5+ years required. Also exclude any position that requires only a GED, high school diploma, or associate degree. Also exclude technician, operator, assembler, machinist, and warehouse roles.

CRITICAL: For apply_url, ONLY use URLs that appeared in your web search results and link to the SPECIFIC JOB POSTING page. Do not return Indeed search pages, LinkedIn search pages, generic careers pages, or generic job-list pages. If you cannot find a direct posting URL, leave apply_url as an empty string.

Return ONLY a JSON array (no markdown, no backticks):
[{"title":"exact title","salary":"range or empty string","location":"city, state","summary":"1 sentence; required skills: [skill1, skill2]","apply_url":"direct URL to this specific job posting or empty string","source":"company careers or ATS name"}]

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
        jobs = parsed
          .filter((j: Record<string, unknown>) =>
            j.title &&
            isDirectJobUrl(String(j.apply_url || "")) &&
            isTodayTargetJob({
              title: String(j.title),
              companyname,
              is_relevant: true,
              apply_url: String(j.apply_url || ""),
            })
          )
          .slice(0, 8)
          .map((j: Record<string, unknown>) => {
            let url = String(j.apply_url || "");
            let source = String(j.source || "");

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
