import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { companies } = await req.json();
  if (!companies || !Array.isArray(companies) || companies.length === 0)
    return NextResponse.json({ descriptions: {} });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ descriptions: {} });

  try {
    const names = companies.slice(0, 10).map((c: string) => c.trim());
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        tools: [{ type: "web_search_preview" }],
        input: `For each company below, find what they do in ONE short phrase (under 10 words). Focus on what they make, design, build, or engineer. If you can't find info, say "Engineering services".

Companies (all in Denver/Colorado area):
${names.map((n: string, i: number) => `${i + 1}. ${n}`).join("\n")}

Return ONLY a JSON object (no markdown, no backticks):
{${names.map((n: string) => `"${n}":"short description"`).join(",")}}`,
        text: { format: { type: "text" } },
      }),
    });

    if (!res.ok) return NextResponse.json({ descriptions: {} });

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

    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      const descriptions = JSON.parse(cleaned);
      return NextResponse.json({ descriptions });
    } catch {
      return NextResponse.json({ descriptions: {} });
    }
  } catch {
    return NextResponse.json({ descriptions: {} });
  }
}
