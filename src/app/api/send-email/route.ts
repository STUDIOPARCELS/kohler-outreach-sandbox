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
    const { to, companyname, contactname, subject, body, letterId, attachments: requestedAttachments, job_title, job_url, job_skills_matched } =
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

    // Strip postal header for email — start at "Hello [Name]"
    let emailBody = body;
    const dearIdx = emailBody.indexOf("Hello ");
    if (dearIdx > 0) {
      emailBody = emailBody.substring(dearIdx);
    }

    // Adjust wording for email context — replace entire closing paragraph
    emailBody = emailBody.replace(
      "I've included my résumé and card, which links to my projects and interests. If you are considering an entry-level BSME/EIT with my skill set, I would love to interview with your team.",
      "I've attached my résumé below. My projects and interests are included here: kohler.solokit.app. If you are considering an entry-level BSME/EIT with my skill set, I would love to interview with your team."
    );

    // Strip the plain-text signature (everything from "Sincerely," on)
    // We'll replace it with a proper HTML signature
    const sincerelyIdx = emailBody.indexOf("Sincerely,");
    if (sincerelyIdx > 0) {
      emailBody = emailBody.substring(0, sincerelyIdx).trim();
    }

    // Always include handwritten signature image
    const signatureImg = `<img src="https://kohler-outreach.vercel.app/KOHLER_SIGNATURE.png" alt="Kohler Wood" width="80" style="display:block; margin:4px 0;" />`;

    // Convert plain text to HTML with proper email signature
    const htmlBody = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; max-width: 650px;">
        ${emailBody
          .split("\n\n")
          .map((p: string) => `<p style="margin: 0 0 12px 0;">${p.replace(/\n/g, "<br>").replace(/kohler\.solokit\.app/g, '<a href="https://kohler.solokit.app" style="color:#2563eb; text-decoration:none;">kohler.solokit.app</a>')}</p>`)
          .join("")}

        <p style="margin: 16px 0 0 0;">Sincerely,</p>

        ${signatureImg}

        <div style="margin-top:4px; font-family:'Helvetica Neue',Arial,sans-serif;">
          <p style="margin:0; font-size:14px; font-weight:bold; color:#1a1a1a;">Kohler Wood</p>
          <p style="margin:0; font-size:12px; color:#666;">Lakewood, Colorado 80226</p>
          <p style="margin:0; font-size:12px; color:#333;">
            <a href="tel:2087204635" style="color:#333; text-decoration:none;">208-720-4635</a>
          </p>
          <p style="margin:0; font-size:12px;">
            <a href="mailto:akwood1@mines.edu" style="color:#2563eb; text-decoration:none;">akwood1@mines.edu</a>
          </p>
          <p style="margin:0; font-size:12px;">
            <a href="https://kohler.solokit.app" style="color:#2563eb; text-decoration:none;">kohler.solokit.app</a>
          </p>
        </div>
      </div>
    `;

    // Build attachments based on selection (default to resume if not specified)
    const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
    const selectedAttachments: string[] = requestedAttachments || ["resume"];

    // Fetch resume PDF
    if (selectedAttachments.includes("resume")) {
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
    }

    // Fetch Solocard Craft GIF
    if (selectedAttachments.includes("solocard_craft")) {
      try {
        const gifRes = await fetch(`${baseUrl}/SOLOCARD_CRAFT.gif`);
        if (gifRes.ok) {
          const gifBuffer = Buffer.from(await gifRes.arrayBuffer());
          attachments.push({
            filename: "Solocard_Craft.gif",
            content: gifBuffer,
            contentType: "image/gif",
          });
        }
      } catch (e) {
        console.error("Failed to fetch Solocard Craft:", e);
      }
    }

    // Fetch Solocard Pro GIF
    if (selectedAttachments.includes("solocard_pro")) {
      try {
        const gifRes = await fetch(`${baseUrl}/SOLOCARD_PRO.gif`);
        if (gifRes.ok) {
          const gifBuffer = Buffer.from(await gifRes.arrayBuffer());
          attachments.push({
            filename: "Solocard_Pro.gif",
            content: gifBuffer,
            contentType: "image/gif",
          });
        }
      } catch (e) {
        console.error("Failed to fetch Solocard Pro:", e);
      }
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

    // Update letter status to "emailed" + save job tracking
    if (letterId) {
      const updateFields: Record<string, unknown> = {
        status: "emailed",
        sent_at: new Date().toISOString(),
        emailed_at: new Date().toISOString(),
      };
      if (job_title) updateFields.job_title = job_title;
      if (job_url) updateFields.job_url = job_url;
      if (job_skills_matched) updateFields.job_skills_matched = job_skills_matched;
      await supabaseAdmin
        .from("reachout_company_inserts")
        .update(updateFields)
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
