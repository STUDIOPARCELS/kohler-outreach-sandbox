"use client";

import { useEffect, useState } from "react";

interface Headline {
  companies_tracked: number;
  companies_with_open_roles: number;
  high_fit_jobs: number;
  jobs_with_pe_signal: number;
  drafts_in_progress: number;
  drafts_approved: number;
  emails_sent: number;
  replies_received: number;
  positive_replies: number;
  recruiter_screens: number;
  follow_ups_due: number;
  applications_submitted: number;
  outreach_actions: number;
  response_rate: number;
  positive_response_rate: number;
}

interface Payload {
  headline: Headline;
  classifications: Record<string, number>;
  table_status: Record<string, boolean>;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const CARD_TILES: Array<{
  key: keyof Headline;
  label: string;
  format?: (n: number) => string;
  hint?: string;
  highlight?: "ok" | "watch";
}> = [
  { key: "companies_tracked", label: "Companies tracked" },
  { key: "companies_with_open_roles", label: "Companies w/ open roles" },
  { key: "high_fit_jobs", label: "High-fit jobs (≥60)" },
  { key: "jobs_with_pe_signal", label: "Jobs w/ PE signal" },
  { key: "outreach_actions", label: "Outreach actions" },
  { key: "drafts_in_progress", label: "Drafts in progress" },
  { key: "drafts_approved", label: "Drafts approved" },
  { key: "emails_sent", label: "Emails sent / drafted" },
  { key: "replies_received", label: "Replies received" },
  { key: "positive_replies", label: "Positive replies" },
  { key: "recruiter_screens", label: "Recruiter screens" },
  { key: "follow_ups_due", label: "Follow-ups due", highlight: "watch" },
  { key: "applications_submitted", label: "Applications submitted" },
  { key: "response_rate", label: "Response rate", format: pct },
  { key: "positive_response_rate", label: "Positive response rate", format: pct },
];

export default function DashboardPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/metrics/overview", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((json: Payload) => {
        if (!cancelled) setData(json);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Outreach dashboard</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Pipeline funnel, response rates, and tables that still need migrations applied.
        </p>
      </header>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-red-800 text-sm">
          {error}
        </div>
      )}

      {data && (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {CARD_TILES.map((tile) => {
              const raw = data.headline[tile.key];
              const value = tile.format ? tile.format(raw) : raw;
              const highlight =
                tile.highlight === "watch" && raw > 0
                  ? "border-amber-400"
                  : "border-gray-200 dark:border-gray-700";
              return (
                <div
                  key={tile.key}
                  className={`rounded border ${highlight} p-3 bg-white dark:bg-gray-900`}
                >
                  <div className="text-xs text-gray-500 dark:text-gray-400">{tile.label}</div>
                  <div className="text-2xl font-semibold mt-1">{value}</div>
                </div>
              );
            })}
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Inbound classifications</h2>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-2 py-1">Class</th>
                    <th className="px-2 py-1">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.classifications).length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-2 py-1 text-gray-500">
                        No inbound messages yet.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(data.classifications)
                      .sort(([, a], [, b]) => b - a)
                      .map(([cls, n]) => (
                        <tr key={cls} className="border-t">
                          <td className="px-2 py-1 font-mono">{cls}</td>
                          <td className="px-2 py-1">{n}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Migration status</h2>
            <ul className="text-sm space-y-1">
              {Object.entries(data.table_status).map(([t, ok]) => (
                <li key={t} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="font-mono">{t}</span>
                  <span className="text-gray-500">{ok ? "applied" : "missing"}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mt-2">
              Apply <code>supabase/migrations/0001..0005_*.sql</code> in order to enable any tables flagged
              <span className="text-red-500"> missing</span>.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
