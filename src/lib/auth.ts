import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://kohler-outreach.vercel.app",
  "https://kohler-outreach-sandbox.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

/**
 * Protect browser-facing API routes.
 * Validates that the request comes from our own app via Origin or Referer header.
 * Returns null if authorized, or a 403 NextResponse if not.
 */
export function requireAppOrigin(req: NextRequest): NextResponse | null {
  // Allow in development
  if (process.env.NODE_ENV === "development") return null;

  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";

  const isAllowed = ALLOWED_ORIGINS.some(
    (allowed) => origin === allowed || referer.startsWith(allowed)
  );

  if (!isAllowed) {
    return NextResponse.json(
      { error: "Forbidden: invalid origin" },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Protect admin/batch API routes that should only be called via scripts or tools.
 * Requires X-API-SECRET header matching the API_SECRET env var.
 * Returns null if authorized, or a 403 NextResponse if not.
 */
export function requireApiSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.API_SECRET;
  if (!secret) {
    // If no secret configured, block all requests (fail closed)
    return NextResponse.json(
      { error: "API_SECRET not configured" },
      { status: 500 }
    );
  }

  const provided = req.headers.get("x-api-secret") || "";
  if (provided !== secret) {
    return NextResponse.json(
      { error: "Forbidden: invalid API secret" },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Protect cron routes. Vercel sends CRON_SECRET automatically.
 * Returns null if authorized, or a 403 NextResponse if not.
 */
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  // If no CRON_SECRET configured, allow (Vercel free tier doesn't always have it)
  if (!secret) return null;

  const provided = req.headers.get("authorization")?.replace("Bearer ", "") || "";
  if (provided !== secret) {
    return NextResponse.json(
      { error: "Forbidden: invalid cron secret" },
      { status: 403 }
    );
  }

  return null;
}
