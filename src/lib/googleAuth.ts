import { google } from "googleapis";
import { supabaseAdmin } from "./supabaseAdmin";

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ||
      "https://kohler-outreach.vercel.app/api/google/callback"
  );
}

export async function getAuthedGmailClient() {
  const { data: account, error } = await supabaseAdmin
    .from("gmail_accounts")
    .select("*")
    .limit(1)
    .single();

  if (error || !account) {
    throw new Error("No Gmail account connected. Visit /api/google/connect first.");
  }

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    refresh_token: account.refresh_token,
    access_token: account.access_token || undefined,
    expiry_date: account.token_expires_at
      ? new Date(account.token_expires_at).getTime()
      : undefined,
  });

  // Auto-refresh if expired
  const { credentials } = await oauth2.refreshAccessToken();
  if (credentials.access_token !== account.access_token) {
    await supabaseAdmin
      .from("gmail_accounts")
      .update({
        access_token: credentials.access_token,
        token_expires_at: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);
  }

  oauth2.setCredentials(credentials);
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  return { gmail, account };
}
