import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const maxDuration = 300; // 5 min for Vercel

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No OpenAI key" }, { status: 500 });

  // Get companies missing careers_url
  const { data: companies, error } = await supabaseAdmin
    .from("companies")
    .select("companyname, niche")
    .is("careers_url", null)
    .neq("niche", "TEST")
    .order("niche")
    .limit(20); // batch of 20 at a time

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!companies || companies.length === 0) return NextResponse.json({ message: "All careers URLs populated", remaining: 0 });

  const results: { company: string; url: string | null; status: string }[] = [];

  for (const company of companies) {
    try {
      // Ask OpenAI to find the actual careers page URL
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          tools: [{ type: "web_search_preview" }],
          input: `Find the careers or jobs page URL for the company "${company.companyname}". This company is in the ${company.niche} industry, likely based in Colorado or nearby.

Search for "${company.companyname} careers" and "${company.companyname} jobs".

Return ONLY the single most relevant careers page URL — nothing else. No explanation, no markdown. Just the URL.
Examples of good results:
- https://www.boeing.com/careers
- https://boards.greenhouse.io/sierrspace
- https://jobs.lever.co/boomtechnology
- https://careers.northropgrumman.com
- https://company.wd1.myworkdayjobs.com/careers

If you truly cannot find a careers page, return: NONE`,
          text: { format: { type: "text" } },
        }),
      });

      if (!res.ok) {
        results.push({ company: company.companyname, url: null, status: "api_error" });
        continue;
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

      const url = text.trim().replace(/```/g, "").trim();

      if (url && url.startsWith("http") && url !== "NONE") {
        await supabaseAdmin
          .from("companies")
          .update({ careers_url: url })
          .eq("companyname", company.companyname);
        results.push({ company: company.companyname, url, status: "found" });
      } else {
        results.push({ company: company.companyname, url: null, status: "not_found" });
      }

      // Rate limit: ~1 request per second
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      results.push({ company: company.companyname, url: null, status: "error" });
    }
  }

  // Count remaining
  const { count } = await supabaseAdmin
    .from("companies")
    .select("*", { count: "exact", head: true })
    .is("careers_url", null)
    .neq("niche", "TEST");

  return NextResponse.json({
    processed: results.length,
    found: results.filter(r => r.status === "found").length,
    remaining: (count || 0) - results.filter(r => r.status === "found").length,
    results,
  });
}
