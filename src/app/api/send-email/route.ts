import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

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

    // Auth with Lisa's Gmail, send as "Kohler Wood", reply-to goes to Kohler
    const gmailUser = process.env.GMAIL_USER;       // Lisa's Gmail
    const gmailPass = process.env.GMAIL_APP_PASSWORD; // App password for Lisa's Gmail
    const replyTo = process.env.REPLY_TO_EMAIL || "akwood1@mines.edu";

    if (!gmailUser || !gmailPass) {
      return NextResponse.json(
        {
          error:
            "Gmail credentials not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel → Settings → Environment Variables.",
        },
        { status: 503 }
      );
    }

    const baseUrl = getBaseUrl(req);

    // Strip postal header for email — start at "Dear [Name]"
    let emailBody = body;
    const dearIdx = emailBody.indexOf("Dear ");
    if (dearIdx > 0) {
      emailBody = emailBody.substring(dearIdx);
    }

    // Convert plain text to HTML
    const htmlBody = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; max-width: 650px;">
        ${emailBody
          .split("\n\n")
          .map((p: string) => `<p style="margin: 0 0 12px 0;">${p.replace(/\n/g, "<br>")}</p>`)
          .join("")}
      </div>
    `;

    // Build attachments
    const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];

    // Fetch resume PDF
    try {
      const pdfRes = await fetch(`${baseUrl}/KOHLER_WOOD_RESUME.pdf`);
      if (pdfRes.ok) {
        const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
        attachments.push({
          filename: "Kohler_Wood_Resume.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        });
      } else {
        console.error("Resume PDF fetch failed:", pdfRes.status);
      }
    } catch (e) {
      console.error("Failed to fetch resume PDF:", e);
    }

    // Fetch SOLOcard image if it exists
    try {
      const cardRes = await fetch(`${baseUrl}/SOLOCARD_KOHLER.png`);
      if (cardRes.ok) {
        const cardBuffer = Buffer.from(await cardRes.arrayBuffer());
        attachments.push({
          filename: "Kohler_Wood_SOLOcard.png",
          content: cardBuffer,
          contentType: "image/png",
        });
      }
    } catch {
      // SOLOcard is optional
    }

    // Gmail SMTP — auth as Lisa, display as Kohler, replies go to Kohler
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const info = await transporter.sendMail({
      from: `"Kohler Wood" <${gmailUser}>`,
      replyTo: `"Kohler Wood" <${replyTo}>`,
      to,
      subject: subject || "Mechanical Engineer — Colorado School of Mines, EIT",
      html: htmlBody,
      attachments,
    });

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
          reply_to: replyTo,
          message_id: info.messageId,
          attachments: attachments.map((a) => a.filename),
        }),
      });
    } catch {
      /* non-critical */
    }

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      attachments: attachments.map((a) => a.filename),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Send email error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
