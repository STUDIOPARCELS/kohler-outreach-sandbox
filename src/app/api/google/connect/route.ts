import { getOAuth2Client } from "@/lib/googleAuth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const oauth2 = getOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
  return NextResponse.redirect(url);
}
