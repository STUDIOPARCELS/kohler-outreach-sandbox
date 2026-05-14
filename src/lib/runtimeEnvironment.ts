import { readFileSync } from "node:fs";
import { join } from "node:path";

export type RuntimeEnvironmentName =
  | "sandbox"
  | "preview"
  | "production"
  | "development"
  | "unknown";

export interface RuntimeEnvironment {
  appEnvironment: RuntimeEnvironmentName;
  appEnvironmentSource: string;
  vercelEnvironment: string | null;
  vercelProjectName: string | null;
  vercelUrlHost: string | null;
  supabaseHost: string | null;
  supabaseProjectRef: string | null;
  parserVersion: {
    ziprecruiter: string;
    careers: string;
    configured: string | null;
  };
  liveSendEnabled: boolean;
  governmentJobSourcesEnabled: boolean;
  contactEnrichmentEnabled: boolean;
}

const ZIPRECRUITER_PARSER_VERSION = "5";
const CAREERS_PARSER_VERSION = "1";

function normalizeEnvironment(value?: string | null): RuntimeEnvironmentName | null {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("sandbox")) return "sandbox";
  if (normalized === "development" || normalized === "dev" || normalized === "local") return "development";
  if (normalized === "preview" || normalized.includes("preview")) return "preview";
  if (normalized === "production" || normalized === "prod") return "production";
  return null;
}

function hostFromUrl(value?: string | null): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).host;
  } catch {
    return null;
  }
}

function supabaseInfo(): { host: string | null; projectRef: string | null } {
  const host = hostFromUrl(process.env.KOHLER_SUPABASE_URL || process.env.SUPABASE_URL);
  return {
    host,
    projectRef: host?.endsWith(".supabase.co") ? host.split(".")[0] : null,
  };
}

function localVercelProjectName(): string | null {
  try {
    const raw = readFileSync(join(process.cwd(), ".vercel", "project.json"), "utf8");
    const parsed = JSON.parse(raw) as { projectName?: string };
    return parsed.projectName || null;
  } catch {
    return null;
  }
}

export function getRuntimeEnvironment(): RuntimeEnvironment {
  const explicitAppEnv =
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.APP_ENV ||
    process.env.KOHLER_DEPLOY_TARGET;
  const vercelEnv = process.env.VERCEL_ENV || null;
  const vercelProjectName = process.env.VERCEL_PROJECT_NAME || localVercelProjectName();
  const vercelUrlHost = hostFromUrl(process.env.VERCEL_URL);
  const { host: supabaseHost, projectRef: supabaseProjectRef } = supabaseInfo();

  const explicit = normalizeEnvironment(explicitAppEnv);
  if (explicit) {
    return {
      appEnvironment: explicit,
      appEnvironmentSource: "explicit_env",
      vercelEnvironment: vercelEnv,
      vercelProjectName,
      vercelUrlHost,
      supabaseHost,
      supabaseProjectRef,
      parserVersion: {
        ziprecruiter: ZIPRECRUITER_PARSER_VERSION,
        careers: CAREERS_PARSER_VERSION,
        configured: process.env.JOB_PARSER_VERSION || null,
      },
      liveSendEnabled: process.env.ENABLE_LIVE_SEND === "true",
      governmentJobSourcesEnabled: process.env.ENABLE_GOVERNMENT_JOB_SOURCES === "true",
      contactEnrichmentEnabled: process.env.ENABLE_CONTACT_ENRICHMENT === "true",
    };
  }

  const deploymentText = [
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_NAME,
    vercelProjectName,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.KOHLER_DEPLOY_TARGET,
    supabaseHost,
  ].filter(Boolean).join(" ").toLowerCase();
  const inferredFromDeployment = normalizeEnvironment(deploymentText);
  const inferredFromVercel = normalizeEnvironment(vercelEnv);
  const local =
    process.env.NODE_ENV === "development" ? "development" : null;

  return {
    appEnvironment:
      inferredFromDeployment ||
      inferredFromVercel ||
      local ||
      "unknown",
    appEnvironmentSource: inferredFromDeployment
      ? "deployment_hint"
      : inferredFromVercel
        ? "vercel_env"
        : local
          ? "node_env"
          : "unknown",
    vercelEnvironment: vercelEnv,
    vercelProjectName,
    vercelUrlHost,
    supabaseHost,
    supabaseProjectRef,
    parserVersion: {
      ziprecruiter: ZIPRECRUITER_PARSER_VERSION,
      careers: CAREERS_PARSER_VERSION,
      configured: process.env.JOB_PARSER_VERSION || null,
    },
    liveSendEnabled: process.env.ENABLE_LIVE_SEND === "true",
    governmentJobSourcesEnabled: process.env.ENABLE_GOVERNMENT_JOB_SOURCES === "true",
    contactEnrichmentEnabled: process.env.ENABLE_CONTACT_ENRICHMENT === "true",
  };
}
