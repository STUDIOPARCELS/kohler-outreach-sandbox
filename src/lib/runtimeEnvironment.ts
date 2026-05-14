// Runtime environment detection used by the Phase 2 sandbox env badge and
// the /api/runtime-diagnostics route. Server-safe; never reads secrets.

export type RuntimeEnvironment =
  | "production"
  | "preview"
  | "sandbox"
  | "development"
  | "unknown";

export interface RuntimeEnvironmentInfo {
  environment: RuntimeEnvironment;
  vercelEnv: string | null;
  appEnv: string | null;
  vercelUrl: string | null;
  branch: string | null;
  supabaseHost: string | null;
  supabaseProjectRef: string | null;
  parserVersions: {
    ziprecruiter_email: number;
    careers: number;
  };
  liveSendEnabled: boolean;
  portfolioUrl: string;
  resumeUrl: string | null;
  candidateEmail: string | null;
  detectedAt: string;
}

export const PARSER_VERSIONS = {
  ziprecruiter_email: 5,
  careers: 1,
} as const;

const PRODUCTION_HOSTS = new Set(["kohler-outreach.vercel.app"]);
const SANDBOX_HOSTS = new Set([
  "kohler-outreach-sandbox.vercel.app",
  "kohler-outreach-claude-sandbox.vercel.app",
]);

function pickHost(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`).host;
  } catch {
    return null;
  }
}

function projectRefFromSupabase(host: string | null): string | null {
  if (!host) return null;
  const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
  return match ? match[1] : null;
}

function classify({
  vercelEnv,
  appEnv,
  vercelUrl,
}: {
  vercelEnv: string | null;
  appEnv: string | null;
  vercelUrl: string | null;
}): RuntimeEnvironment {
  // Explicit override wins. Useful for force-labelling a sandbox preview.
  if (appEnv) {
    const lower = appEnv.toLowerCase();
    if (
      lower === "production" ||
      lower === "preview" ||
      lower === "sandbox" ||
      lower === "development"
    ) {
      return lower;
    }
  }

  const host = pickHost(vercelUrl);
  if (host && SANDBOX_HOSTS.has(host)) return "sandbox";
  if (host && PRODUCTION_HOSTS.has(host)) return "production";

  if (vercelEnv === "production") {
    // Production VERCEL_ENV but unknown host (e.g. preview alias) — treat as
    // sandbox if the host string mentions "sandbox" or "claude".
    if (host && /sandbox|claude/i.test(host)) return "sandbox";
    return "production";
  }
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "development") return "development";

  if (process.env.NODE_ENV === "development") return "development";
  return "unknown";
}

export function getRuntimeEnvironment(): RuntimeEnvironmentInfo {
  const vercelEnv = process.env.VERCEL_ENV ?? null;
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? null;
  const vercelUrl = process.env.VERCEL_URL ?? null;
  const branch =
    process.env.VERCEL_GIT_COMMIT_REF ??
    process.env.VERCEL_GIT_BRANCH ??
    null;

  const environment = classify({ vercelEnv, appEnv, vercelUrl });

  const supabaseHost = pickHost(
    process.env.KOHLER_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null
  );

  return {
    environment,
    vercelEnv,
    appEnv,
    vercelUrl,
    branch,
    supabaseHost,
    supabaseProjectRef: projectRefFromSupabase(supabaseHost),
    parserVersions: { ...PARSER_VERSIONS },
    liveSendEnabled:
      (process.env.ENABLE_LIVE_SEND ?? "").toLowerCase() === "true",
    portfolioUrl:
      process.env.KOHLER_PORTFOLIO_URL ?? "https://kohler.solokit.app",
    resumeUrl: process.env.KOHLER_RESUME_URL ?? null,
    candidateEmail: process.env.REPLY_TO_EMAIL ?? null,
    detectedAt: new Date().toISOString(),
  };
}

export function isSandbox(env?: RuntimeEnvironment): boolean {
  return (env ?? getRuntimeEnvironment().environment) === "sandbox";
}

export function isProduction(env?: RuntimeEnvironment): boolean {
  return (env ?? getRuntimeEnvironment().environment) === "production";
}
