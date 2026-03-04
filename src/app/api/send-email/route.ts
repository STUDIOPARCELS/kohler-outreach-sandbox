import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { to, companyname, contactname, subject, htmlBody, letterIds } = await req.json();

    if (!to || !htmlBody) {
      return NextResponse.json({ error: "Missing required fields (to, htmlBody)" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY not configured. Add it in Vercel → Settings → Environment Variables." },
        { status: 503 }
      );
    }

    // Fetch resume PDF and card image from storage
    const { data: assets } = await supabaseAdmin
      .from("candidate_assets")
      .select("asset_type, url, title")
      .eq("profile_id", 1)
      .in("asset_type", ["resume", "card"]);

    const attachments: { filename: string; content: string }[] = [];

    for (const asset of assets || []) {
      try {
        const res = await fetch(asset.url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = asset.asset_type === "resume" ? ".pdf" : ".png";
        attachments.push({
          filename: `${asset.title || asset.asset_type}${ext}`,
          content: buf.toString("base64"),
        });
      } catch {
        // Skip failed attachment fetches
      }
    }

    // Send via Resend
    const fromEmail = process.env.FROM_EMAIL || "Kohler Wood <onboarding@resend.dev>";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: subject || `Introduction — Andrew (Kohler) Wood III`,
        html: htmlBody,
        attachments,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      return NextResponse.json(
        { error: resendData.message || "Resend API error", details: resendData },
        { status: resendRes.status }
      );
    }

    // Log the send — update letter status
    if (letterIds && Array.isArray(letterIds)) {
      for (const id of letterIds) {
        await supabaseAdmin
          .from("reachout_company_inserts")
          .update({ status: "emailed" })
          .eq("id", id);
      }
    }

    // Log to tracking table
    try {
      await supabaseAdmin.from("tracking").insert({
        companyname,
        contactname: contactname || null,
        action: "email_sent",
        details: JSON.stringify({ to, resend_id: resendData.id, attachments: attachments.map(a => a.filename) }),
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, id: resendData.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
