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

    // No fresh cache — try live search via SearXNG (free, no auth needed)
    const query = encodeURIComponent(`${companyname} mechanical engineer jobs Denver Colorado`);
    const searxInstances = [
      "https://search.bus-hit.me",
      "https://priv.au",
      "https://search.ononoki.org",
    ];

    type JobResult = { title: string; location: string; salary: string; summary: string; apply_url: string; source: string; companyname: string };
    const jobs: JobResult[] = [];

    for (const instance of searxInstances) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${instance}/search?q=${query}&format=json&categories=general`, {
          headers: { Accept: "application/json", "User-Agent": "KohlerOutreach/1.0" },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) continue;
        const data = await res.json();
        const results = (data.results || []).slice(0, 10);

        const jobKeywords = /job|career|position|hiring|engineer|apply|opening|opportunit/i;
        const jobSites = /indeed\.com|linkedin\.com\/jobs|glassdoor\.com|dice\.com|ziprecruiter\.com|builtin\.com|lever\.co|greenhouse\.io|workday/i;

        for (const r of results) {
          const url: string = r.url || "";
          const title: string = r.title || "";
          const snippet: string = r.content || "";
          if (!url) continue;

          if (jobKeywords.test(title) || jobKeywords.test(snippet) || jobSites.test(url)) {
            const salaryMatch = snippet.match(/\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?(?:\s*(?:per|a|\/)\s*(?:year|hr|hour))?/i);
            let host = "";
            try { host = new URL(url).hostname.replace("www.", ""); } catch { host = "web"; }

            jobs.push({
              title: title.replace(/\s*[-|–].*$/, "").trim().slice(0, 140),
              location: "Denver, CO area",
              salary: salaryMatch ? salaryMatch[0] : "",
              summary: snippet.slice(0, 250),
              apply_url: url,
              source: host,
              companyname,
            });
          }
        }
        if (jobs.length > 0) break;
      } catch { continue; }
    }

    // Cache results
    if (jobs.length > 0) {
      await supabaseAdmin.from("job_listings").delete().eq("companyname", companyname);
      await supabaseAdmin.from("job_listings").insert(
        jobs.map((j) => ({
          companyname: j.companyname,
          title: j.title,
          salary: j.salary || null,
          location: j.location,
          summary: j.summary,
          apply_url: j.apply_url,
          source: j.source,
          fetched_at: new Date().toISOString(),
        }))
      );
    }

    // Fallback: check for any older cache
    if (jobs.length === 0) {
      const { data: oldCache } = await supabaseAdmin
        .from("job_listings")
        .select("*")
        .eq("companyname", companyname)
        .order("fetched_at", { ascending: false })
        .limit(5);
      if (oldCache && oldCache.length > 0) {
        return NextResponse.json({ jobs: oldCache, source: "old_cache" });
      }
    }

    return NextResponse.json({ jobs, source: jobs.length > 0 ? "live" : "none" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
