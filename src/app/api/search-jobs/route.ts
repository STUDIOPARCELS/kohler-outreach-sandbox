import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { companyname } = await req.json();
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  try {
    // Check cache first (results less than 7 days old)
    const { data: cached } = await supabaseAdmin
      .from("job_listings")
      .select("*")
      .eq("companyname", companyname)
      .gte("fetched_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("fetched_at", { ascending: false });

    if (cached && cached.length > 0) {
      return NextResponse.json({ jobs: cached, source: "cache" });
    }

    // Use OpenAI Responses API with web search
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ jobs: [], source: "no_key" });
    }

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        tools: [{ type: "web_search_preview" }],
        input: `Search for current mechanical engineer job openings at "${companyname}" in Denver, Colorado area. 

Return ONLY a JSON array (no markdown, no backticks) of up to 5 jobs. Each object must have:
- "title": job title
- "salary": salary range if mentioned, or empty string
- "location": city and state  
- "summary": 1-2 sentence description of the role
- "apply_url": the actual URL to the job posting
- "source": the website domain (e.g. "indeed.com", "linkedin.com")

If no jobs found for this specific company, return an empty array [].
Return ONLY the JSON array, nothing else.`,
        text: { format: { type: "text" } },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("OpenAI error:", res.status, errText);
      return NextResponse.json({ jobs: [], source: "api_error" });
    }

    const data = await res.json();
    
    // Extract text from response
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

    // Parse JSON from response
    let jobs: { title: string; salary: string; location: string; summary: string; apply_url: string; source: string }[] = [];
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        jobs = parsed.filter((j: Record<string, unknown>) => j.title && j.apply_url).slice(0, 8);
      }
    } catch { /* parse failed */ }

    // Cache results
    if (jobs.length > 0) {
      await supabaseAdmin.from("job_listings").delete().eq("companyname", companyname);
      await supabaseAdmin.from("job_listings").insert(
        jobs.map((j) => ({
          companyname,
          title: j.title || "",
          salary: j.salary || null,
          location: j.location || "Denver, CO area",
          summary: j.summary || "",
          apply_url: j.apply_url || "",
          source: j.source || "web",
          fetched_at: new Date().toISOString(),
        }))
      );
    }

    return NextResponse.json({ jobs, source: jobs.length > 0 ? "openai" : "none" });
  } catch (e) {
    console.error("search-jobs error:", e);
    return NextResponse.json({ jobs: [], source: "error", error: (e as Error).message });
  }
}
