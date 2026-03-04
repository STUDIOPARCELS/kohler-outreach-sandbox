import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

// Get the base URL for fetching public assets
function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("host") || "kohler-outreach.vercel.app";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

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

    const baseUrl = getBaseUrl(req);

    // Convert plain text letter to HTML
    const htmlBody = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; max-width: 650px;">
        ${body
          .split("\n\n")
          .map((p: string) => `<p style="margin: 0 0 12px 0;">${p.replace(/\n/g, "<br>")}</p>`)
          .join("")}
      </div>
    `;

    // Fetch resume PDF via URL (readFileSync doesn't work on Vercel serverless)
    const attachments: { filename: string; content: string }[] = [];

    try {
      const pdfRes = await fetch(`${baseUrl}/KOHLER_WOOD_RESUME.pdf`);
      if (pdfRes.ok) {
        const pdfBuffer = await pdfRes.arrayBuffer();
        const resumeBase64 = Buffer.from(pdfBuffer).toString("base64");
        attachments.push({
          filename: "Kohler_Wood_Resume.pdf",
          content: resumeBase64,
        });
      } else {
        console.error("Resume PDF fetch failed:", pdfRes.status);
      }
    } catch (e) {
      console.error("Failed to fetch resume PDF:", e);
    }

    // Fetch SOLOcard icon if it exists
    try {
      const cardRes = await fetch(`${baseUrl}/SOLOCARD_KOHLER.png`);
      if (cardRes.ok) {
        const cardBuffer = await cardRes.arrayBuffer();
        const cardBase64 = Buffer.from(cardBuffer).toString("base64");
        attachments.push({
          filename: "Kohler_Wood_SOLOcard.png",
          content: cardBase64,
        });
      }
    } catch {
      // SOLOcard is optional — skip silently if not found
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
          attachments: attachments.map(a => a.filename),
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
