// Phase 9 — POST /api/gmail/send-approved
//   { draft_id }
// Convenience wrapper around create-draft with mode="send".

import { NextRequest, NextResponse } from "next/server";
import { requireAppOrigin } from "@/lib/auth";
import { getRuntimeEnvironment } from "@/lib/runtimeEnvironment";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authError = requireAppOrigin(req);
  if (authError) return authError;

  const env = getRuntimeEnvironment();
  if (!env.liveSendEnabled) {
    return NextResponse.json(
      {
        ok: false,
        error: "ENABLE_LIVE_SEND is not 'true' — refusing to send.",
        environment: env.environment,
      },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  if (!body?.draft_id) {
    return NextResponse.json({ error: "draft_id required" }, { status: 400 });
  }

  const url = new URL(req.url);
  const target = `${url.origin}/api/gmail/create-draft`;
  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: req.headers.get("origin") ?? url.origin },
    body: JSON.stringify({ draft_id: body.draft_id, mode: "send" }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
