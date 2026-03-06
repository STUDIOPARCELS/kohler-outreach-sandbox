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

    type JobResult = { title: string; location: string; salary: string; summary: string; apply_url: string; source: string; companyname: string };
    const jobs: JobResult[] = [];

    // Try Indeed RSS feed (structured, reliable, free)
    const indeedQuery = encodeURIComponent(`${companyname} mechanical engineer`);
    try {
      const indeedUrl = `https://www.indeed.com/rss?q=${indeedQuery}&l=Denver%2C+CO&sort=date&limit=10`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(indeedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KohlerOutreach/1.0)" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const xml = await res.text();
        // Parse RSS items
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xml)) !== null && jobs.length < 8) {
          const item = match[1];
          const getTag = (tag: string) => {
            const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
            return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
          };
          const title = getTag("title");
          const link = getTag("link") || getTag("guid");
          const desc = getTag("description").replace(/<[^>]+>/g, "").trim();

          if (title && link) {
            const salaryMatch = desc.match(/\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?(?:\s*(?:per|a|\/)\s*(?:year|hr|hour))?/i);
            jobs.push({
              title: title.slice(0, 140),
              location: "Denver, CO area",
              salary: salaryMatch ? salaryMatch[0] : "",
              summary: desc.slice(0, 250),
              apply_url: link,
              source: "indeed.com",
              companyname,
            });
          }
        }
      }
    } catch { /* Indeed failed, try fallback */ }

    // Fallback: ZipRecruiter search page
    if (jobs.length === 0) {
      try {
        const zipQuery = encodeURIComponent(`${companyname} mechanical engineer`);
        const zipUrl = `https://www.ziprecruiter.com/jobs-search?search=${zipQuery}&location=Denver%2C+CO&radius=25`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(zipUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const html = await res.text();
          // Extract job cards from ZipRecruiter HTML
          const cardRegex = /<article[^>]*class="[^"]*job_result[^"]*"[\s\S]*?<\/article>/gi;
          let cardMatch;
          while ((cardMatch = cardRegex.exec(html)) !== null && jobs.length < 8) {
            const card = cardMatch[0];
            const titleMatch = card.match(/class="[^"]*job_title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
            const salaryMatch = card.match(/\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?/);
            const snippetMatch = card.match(/class="[^"]*snippet[^"]*"[^>]*>([\s\S]*?)<\//i);

            if (titleMatch) {
              jobs.push({
                title: titleMatch[2].replace(/<[^>]+>/g, "").trim().slice(0, 140),
                location: "Denver, CO area",
                salary: salaryMatch ? salaryMatch[0] : "",
                summary: snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 250) : "",
                apply_url: titleMatch[1].startsWith("http") ? titleMatch[1] : `https://www.ziprecruiter.com${titleMatch[1]}`,
                source: "ziprecruiter.com",
                companyname,
              });
            }
          }
        }
      } catch { /* ZipRecruiter failed too */ }
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

    // Fallback: check old cache
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
