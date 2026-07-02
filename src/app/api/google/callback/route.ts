import { getOAuth2Client } from "@/lib/googleAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
  }

  try {
    const oauth2 = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.json(
        { error: "No refresh_token received. Revoke access at https://myaccount.google.com/permissions and try again." },
        { status: 400 }
      );
    }

    // Get the user's email address
    oauth2.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress || "unknown";

    // Find or create the ZipRecruiter label
    const labels = await gmail.users.labels.list({ userId: "me" });
    const existingLabel = labels.data.labels?.find(
      (l) => l.name === "ziprecruiter/mech-80226-30mi"
    );

    let labelId = existingLabel?.id || null;
    if (!labelId) {
      try {
        const created = await gmail.users.labels.create({
          userId: "me",
          requestBody: { name: "ziprecruiter/mech-80226-30mi", labelListVisibility: "labelShow", messageListVisibility: "show" },
        });
        labelId = created.data.id || null;
      } catch {
        // Label might need different scope to create; store name only
      }
    }

    // Upsert gmail_accounts
    const { error: upsertError } = await supabaseAdmin.from("gmail_accounts").upsert(
      {
        email,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token || null,
        token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        label_name: "ziprecruiter/mech-80226-30mi",
        label_id: labelId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

    // Redirect back to the engine. If the tokens didn't persist, ingest cannot
    // run — "?gmail=connected" would be a lie.
    const baseUrl = req.nextUrl.origin || "https://kohler-outreach.vercel.app";
    if (upsertError) {
      console.error("Google callback: gmail_accounts upsert failed:", upsertError.message);
      return NextResponse.redirect(`${baseUrl}/?gmail=error`);
    }
    return NextResponse.redirect(`${baseUrl}/?gmail=connected`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Google callback error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
