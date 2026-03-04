import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function POST(req: NextRequest) {
  try {
    const { to, companyname, contactname, subject, body, letterId } =
      await req.json();

    if (!to || !body) {
      return NextResponse.json(
        { error: "Missing required fields (to, body)" },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "RESEND_API_KEY not configured. Add it in Vercel → Settings → Environment Variables.",
        },
        { status: 503 }
      );
    }

    // Convert plain text letter to HTML
    const htmlBody = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; max-width: 650px;">
        ${body
          .split("\n\n")
          .map((p: string) => `<p style="margin: 0 0 12px 0;">${p.replace(/\n/g, "<br>")}</p>`)
          .join("")}
      </div>
    `;

    // Read resume PDF from bundled public folder
    let resumeBase64 = "";
    try {
      const pdfPath = join(process.cwd(), "public", "KOHLER_WOOD_RESUME.pdf");
      const pdfBuffer = readFileSync(pdfPath);
      resumeBase64 = pdfBuffer.toString("base64");
    } catch (e) {
      console.error("Failed to read resume PDF:", e);
    }

    const attachments: { filename: string; content: string }[] = [];
    if (resumeBase64) {
      attachments.push({
        filename: "Kohler_Wood_Resume.pdf",
        content: resumeBase64,
      });
    }

    // Send via Resend
    const fromEmail =
      process.env.FROM_EMAIL || "Kohler Wood <kohler@kohler.solokit.app>";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject:
          subject ||
          `Introduction — Andrew (Kohler) Wood III, BSME/EIT`,
        html: htmlBody,
        attachments,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      return NextResponse.json(
        {
          error: resendData.message || "Resend API error",
          details: resendData,
        },
        { status: resendRes.status }
      );
    }

    // Update letter status to "emailed"
    if (letterId) {
      await supabaseAdmin
        .from("reachout_company_inserts")
        .update({
          status: "emailed",
          sent_at: new Date().toISOString(),
        })
        .eq("id", letterId);
    }

    // Log to tracking
    try {
      await supabaseAdmin.from("tracking").insert({
        companyname,
        contactname: contactname || null,
        action: "email_sent",
        details: JSON.stringify({
          to,
          resend_id: resendData.id,
          has_resume: !!resumeBase64,
        }),
      });
    } catch {
      /* non-critical */
    }

    return NextResponse.json({ success: true, id: resendData.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
