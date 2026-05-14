// Phase 9 — POST /api/gmail/sync-incremental
//
// Lightweight wrapper around backfill-responses that defaults to the
// last 7 days. Designed to run on a frequent cron schedule.

import { NextRequest, NextResponse } from "next/server";
import { requireApiSecret, requireCronSecret } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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
    body: JSON.stringify({ query: "in:inbox newer_than:7d", max_messages: 50 }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
