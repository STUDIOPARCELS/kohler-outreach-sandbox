import { requireAppOrigin } from "@/lib/auth";
import { isHumanApprovedDraftStatus, isLiveSendEnabled, liveSendDisabledMessage } from "@/lib/outreachSafety";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("host") || "kohler-outreach-sandbox.vercel.app";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  try {
    const { letterId, to, subject, body, attachResume, followupNumber } = await req.json();

    if (!letterId || !to || !body) {
      return NextResponse.json(
        { error: "Missing required fields (letterId, to, body)" },
        { status: 400 }
      );
    }

    if (!isLiveSendEnabled()) {
      return NextResponse.json({ error: liveSendDisabledMessage() }, { status: 403 });
    }

    const { data: approvedLetter, error: approvalError } = await supabaseAdmin
      .from("reachout_company_inserts")
      .select("id, status")
      .eq("id", letterId)
      .maybeSingle();

    if (approvalError) {
      return NextResponse.json({ error: approvalError.message }, { status: 500 });
    }
    if (!approvedLetter) {
      return NextResponse.json({ error: "Draft not found for live send approval gate." }, { status: 404 });
    }
    if (!isHumanApprovedDraftStatus(approvedLetter.status)) {
      return NextResponse.json(
        { error: "Draft must be marked human_approved before live Gmail send." },
        { status: 409 }
      );
    }

    const isSecondFollowup = followupNumber === 2;

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
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

    // Handwritten signature image
    const signatureImg = `<img src="https://kohler-outreach.vercel.app/KOHLER_SIGNATURE.png" alt="Kohler Wood" width="80" style="display:block; margin:4px 0;" />`;

    // Strip signature block from body if present (it's in the editable textarea for preview)
    // The HTML version uses the styled signature instead
    const bodyWithoutSig = body.replace(/\n\nSincerely,[\s\S]*$/, "");

    // Convert plain text body to HTML
    const htmlBody = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; max-width: 650px;">
        ${bodyWithoutSig
          .split("\n\n")
          .map(
            (p: string) =>
              `<p style="margin: 0 0 12px 0;">${p
                .replace(/\n/g, "<br>")
                .replace(
                  /kohler\.solokit\.app/g,
                  '<a href="https://kohler.solokit.app" style="color:#2563eb; text-decoration:none;">kohler.solokit.app</a>'
                )}</p>`
          )
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

    // Build attachments
    const attachments: {
      filename: string;
      content: Buffer;
      contentType?: string;
    }[] = [];

    if (attachResume !== false) {
      try {
        const baseUrl = getBaseUrl(req);
        const pdfRes = await fetch(`${baseUrl}/KOHLER_RESUME_2026.pdf`);
        if (pdfRes.ok) {
          const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
          attachments.push({
            filename: "Kohler_Wood_Resume.pdf",
            content: pdfBuffer,
            contentType: "application/pdf",
          });
        }
      } catch (e) {
        console.error("Failed to fetch resume PDF:", e);
      }
    }

    // Send via Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    const info = await transporter.sendMail({
      from: `"Kohler Wood" <${gmailUser}>`,
      replyTo: `"Kohler Wood" <${replyTo}>`,
      to,
      subject: subject || "Following up — Mechanical Engineer, EIT",
      html: htmlBody,
      attachments,
    });

    // Update the letter record
    const updateFields = isSecondFollowup
      ? { followup2_at: new Date().toISOString(), status: "followup2_sent" }
      : { emailed_at: new Date().toISOString(), status: "emailed" };

    await supabaseAdmin
      .from("reachout_company_inserts")
      .update(updateFields)
      .eq("id", letterId);

    // Log to tracking
    try {
      const { data: letter } = await supabaseAdmin
        .from("reachout_company_inserts")
        .select("companyname, contactname")
        .eq("id", letterId)
        .single();

      await supabaseAdmin.from("tracking").insert({
        companyname: letter?.companyname || "Unknown",
        contactname: letter?.contactname || null,
        action: "followup_email_sent",
        details: JSON.stringify({
          to,
          reply_to: replyTo,
          message_id: info.messageId,
          type: isSecondFollowup ? "14_day_followup" : "7_day_followup",
        }),
      });
    } catch {
      /* non-critical */
    }

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Follow-up send error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
