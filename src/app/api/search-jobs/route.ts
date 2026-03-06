import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { companyname } = await req.json();
  if (!companyname)
    return NextResponse.json({ error: "companyname required" }, { status: 400 });

  type Job = { title: string; location: string; salary: string; summary: string; apply_url: string; source: string };
  const jobs: Job[] = [];

  // Indeed RSS — live, no auth, structured XML
  try {
    const q = encodeURIComponent(`"${companyname}" mechanical engineer`);
    const url = `https://www.indeed.com/rss?q=${q}&l=Denver%2C+CO&sort=date&limit=10`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KohlerOutreach/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const xml = await res.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && jobs.length < 8) {
        const item = match[1];
        const tag = (t: string) => {
          const m = item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
          return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
        };
        const title = tag("title");
        const link = tag("link") || tag("guid");
        const desc = tag("description").replace(/<[^>]+>/g, "").trim();
        if (title && link) {
          const sal = desc.match(/\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?(?:\s*(?:per|a|\/)\s*(?:year|hr|hour))?/i);
          jobs.push({
            title: title.slice(0, 140),
            location: "Denver, CO area",
            salary: sal ? sal[0] : "",
            summary: desc.slice(0, 250),
            apply_url: link,
            source: "indeed.com",
          });
        }
      }
    }
  } catch { /* Indeed failed */ }

  // Broader Indeed search if company-specific returned nothing
  if (jobs.length === 0) {
    try {
      const q = encodeURIComponent(`${companyname} engineer`);
      const url = `https://www.indeed.com/rss?q=${q}&l=Denver%2C+CO&sort=date&limit=10`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KohlerOutreach/1.0)" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const xml = await res.text();
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xml)) !== null && jobs.length < 8) {
          const item = match[1];
          const tag = (t: string) => {
            const m = item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
            return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
          };
          const title = tag("title");
          const link = tag("link") || tag("guid");
          const desc = tag("description").replace(/<[^>]+>/g, "").trim();
          if (title && link) {
            const sal = desc.match(/\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?(?:\s*(?:per|a|\/)\s*(?:year|hr|hour))?/i);
            jobs.push({
              title: title.slice(0, 140),
              location: "Denver, CO area",
              salary: sal ? sal[0] : "",
              summary: desc.slice(0, 250),
              apply_url: link,
              source: "indeed.com",
            });
          }
        }
      }
    } catch { /* broader search failed too */ }
  }

  return NextResponse.json({ jobs });
}
