"use client";

import { useEffect, useState } from "react";

type Environment =
  | "production"
  | "preview"
  | "sandbox"
  | "development"
  | "unknown";

interface DiagnosticsResponse {
  ok: boolean;
  environment: {
    environment: Environment;
    vercelEnv: string | null;
    branch: string | null;
    supabaseProjectRef: string | null;
    parserVersions: { ziprecruiter_email: number; careers: number };
    liveSendEnabled: boolean;
  };
  jobs: {
    total: number | null;
    relevant: number | null;
    distinctOpenRoleCompanies: number | null;
    latestPostedAt: string | null;
  };
  ingest: {
    latestRun: {
      source_type: string | null;
      status: string | null;
      started_at: string | null;
      finished_at: string | null;
    } | null;
    lastSuccessfulIngestAt: string | null;
    runsTable: string | null;
  };
  gmail: {
    accounts: number | null;
  };
  warnings: string[];
}

const ENV_STYLES: Record<Environment, string> = {
  production: "bg-red-600 text-white border-red-800",
  preview: "bg-amber-500 text-white border-amber-700",
  sandbox: "bg-emerald-500 text-white border-emerald-700",
  development: "bg-slate-600 text-white border-slate-800",
  unknown: "bg-zinc-500 text-white border-zinc-700",
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function EnvironmentBadge() {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runtime-diagnostics", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`diagnostics ${res.status}`);
        return res.json();
      })
      .then((json: DiagnosticsResponse) => {
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const env = data?.environment.environment ?? "unknown";
  const label = env.toUpperCase();
  const style = ENV_STYLES[env] ?? ENV_STYLES.unknown;

  return (
    <div className="no-print fixed bottom-4 left-4 z-50 max-w-sm">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`text-xs font-bold px-3 py-1.5 rounded-md shadow border ${style} hover:opacity-90 transition`}
        aria-expanded={open}
        aria-controls="env-diagnostics-panel"
      >
        {label}
        {data?.environment.liveSendEnabled ? " · LIVE SEND" : ""}
        {data?.environment.branch ? ` · ${data.environment.branch}` : ""}
      </button>
      {open && (
        <div
          id="env-diagnostics-panel"
          className="mt-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-lg p-3 text-xs space-y-2 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
        >
          {error && (
            <div className="text-red-600 font-medium">
              diagnostics error: {error}
            </div>
          )}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <div className="text-gray-500 dark:text-gray-400">env</div>
                <div className="font-mono">{env}</div>

                <div className="text-gray-500 dark:text-gray-400">vercel</div>
                <div className="font-mono">
                  {data.environment.vercelEnv ?? "—"}
                </div>

                <div className="text-gray-500 dark:text-gray-400">branch</div>
                <div className="font-mono">
                  {data.environment.branch ?? "—"}
                </div>

                <div className="text-gray-500 dark:text-gray-400">supabase</div>
                <div className="font-mono">
                  {data.environment.supabaseProjectRef ?? "—"}
                </div>

                <div className="text-gray-500 dark:text-gray-400">parsers</div>
                <div className="font-mono">
                  zr v{data.environment.parserVersions.ziprecruiter_email} · careers v
                  {data.environment.parserVersions.careers}
                </div>

                <div className="text-gray-500 dark:text-gray-400">live send</div>
                <div className="font-mono">
                  {data.environment.liveSendEnabled ? "enabled" : "disabled"}
                </div>
              </div>

              <hr className="border-gray-200 dark:border-gray-700" />

              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <div className="text-gray-500 dark:text-gray-400">jobs total</div>
                <div className="font-mono">{data.jobs.total ?? "—"}</div>

                <div className="text-gray-500 dark:text-gray-400">jobs relevant</div>
                <div className="font-mono">{data.jobs.relevant ?? "—"}</div>

                <div className="text-gray-500 dark:text-gray-400">open-role co's</div>
                <div className="font-mono">
                  {data.jobs.distinctOpenRoleCompanies ?? "—"}
                </div>

                <div className="text-gray-500 dark:text-gray-400">latest job</div>
                <div className="font-mono">
                  {formatTimestamp(data.jobs.latestPostedAt)}
                </div>
              </div>

              <hr className="border-gray-200 dark:border-gray-700" />

              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <div className="text-gray-500 dark:text-gray-400">runs table</div>
                <div className="font-mono">{data.ingest.runsTable ?? "—"}</div>

                <div className="text-gray-500 dark:text-gray-400">last sync</div>
                <div className="font-mono">
                  {formatTimestamp(data.ingest.latestRun?.finished_at ?? data.ingest.latestRun?.started_at ?? null)}
                </div>

                <div className="text-gray-500 dark:text-gray-400">last sync src</div>
                <div className="font-mono">
                  {data.ingest.latestRun?.source_type ?? "—"}
                </div>

                <div className="text-gray-500 dark:text-gray-400">last sync ok</div>
                <div className="font-mono">
                  {formatTimestamp(data.ingest.lastSuccessfulIngestAt)}
                </div>

                <div className="text-gray-500 dark:text-gray-400">gmail accts</div>
                <div className="font-mono">{data.gmail.accounts ?? "—"}</div>
              </div>

              {data.warnings.length > 0 && (
                <>
                  <hr className="border-gray-200 dark:border-gray-700" />
                  <div className="text-amber-600 dark:text-amber-400 space-y-0.5">
                    {data.warnings.map((w, i) => (
                      <div key={i}>· {w}</div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
