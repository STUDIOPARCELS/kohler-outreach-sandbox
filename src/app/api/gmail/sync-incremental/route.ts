// Session F — POST /api/gmail/sync-incremental
//
// Daily cron wrapper around backfill-responses. Pulls the last 2 days of
// inbox messages (overlap is fine — `email_messages.gmail_message_id` is
// UNIQUE so duplicates are skipped).
//
// Wired in vercel.json as `0 14 * * *` UTC = 8am MST.
// GET also accepted so a healthcheck or smoke ping doesn't 405.

import { NextRequest, NextResponse } from "next/server";
import { requireApiSecret, requireCronSecret } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_QUERY = "in:inbox newer_than:2d";
const DEFAULT_MAX_MESSAGES = 100;

async function run(req: NextRequest) {
  const apiAuth = requireApiSecret(req);
  if (apiAuth) {
    const cronAuth = requireCronSecret(req);
    if (cronAuth) return cronAuth;
  }

  const url = new URL(req.url);
  const target = `${url.origin}/api/gmail/backfill-responses`;
  const res = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": req.headers.get("x-api-secret") ?? "",
      authorization: req.headers.get("authorization") ?? "",
      origin: url.origin,
    },
    body: JSON.stringify({ query: DEFAULT_QUERY, max_messages: DEFAULT_MAX_MESSAGES }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export const POST = run;
export const GET = run;
