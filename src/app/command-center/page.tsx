"use client";

import { useEffect, useMemo, useState } from "react";

type RecommendedAction =
  | "apply_now"
  | "email_engineering_manager"
  | "email_recruiter"
  | "alumni_outreach"
  | "pe_track_outreach"
  | "physical_letter"
  | "monitor"
  | "skip";

interface FitScore {
  job_id: number;
  skill_fit_score: number;
  entry_level_score: number;
  pe_track_score: number;
  niche_score: number;
  location_score: number;
  mines_signal_score: number;
  overall_score: number;
  recommended_action: RecommendedAction;
  explanation_json?: {
    matched_skills?: string[];
    pe_signals?: string[];
    location_band?: string | null;
    niche_match?: string | null;
    seniority_flag?: string | null;
    notes?: string[];
  };
  fallback?: boolean;
}

interface JobRow {
  id: number;
  companyname: string;
  title: string;
  location: string | null;
  source: string | null;
  niche: string | null;
  apply_url: string | null;
  job_url: string | null;
  source_url: string | null;
  ingest_status: string | null;
  last_seen_at: string | null;
}

interface ContactSummary {
  count: number;
  emailCount: number;
  bestContactName: string | null;
  bestContactTitle: string | null;
  bestContactEmail: string | null;
}

interface OutreachSummary {
  draftCount: number;
  printedCount: number;
  sentCount: number;
  lastDraftAt: string | null;
}

interface EnrichedJob {
  job: JobRow;
  company: {
    id: number;
    companyname: string;
    city: string | null;
    niche: string | null;
    careers_url: string | null;
  } | null;
  fit: FitScore | null;
  contact: ContactSummary;
  outreach: OutreachSummary;
}

interface CompanyRollup {
  companyname: string;
  city: string | null;
  niche: string | null;
  careers_url: string | null;
  total_open_roles: number;
  best_overall_score: number;
  best_pe_score: number;
  best_recommended_action: RecommendedAction;
  best_role_title: string;
  best_role_id: number;
  sources: string[];
  last_seen_at: string | null;
  contacts: ContactSummary;
  outreach: OutreachSummary;
}

interface CommandCenterPayload {
  sort: string;
  counts: {
    total_jobs: number;
    total_companies: number;
    jobs_pe_signal: number;
    jobs_with_persisted_fit: number;
  };
  companies: CompanyRollup[];
  jobs: EnrichedJob[];
}

const ACTION_STYLES: Record<RecommendedAction, string> = {
  apply_now: "bg-emerald-600 text-white",
  email_engineering_manager: "bg-blue-600 text-white",
  email_recruiter: "bg-sky-600 text-white",
  alumni_outreach: "bg-indigo-600 text-white",
  pe_track_outreach: "bg-violet-600 text-white",
  physical_letter: "bg-amber-600 text-white",
  monitor: "bg-slate-500 text-white",
  skip: "bg-zinc-400 text-white",
};

const ACTION_LABELS: Record<RecommendedAction, string> = {
  apply_now: "Apply now",
  email_engineering_manager: "Email EM",
  email_recruiter: "Email recruiter",
  alumni_outreach: "Mines alumni intro",
  pe_track_outreach: "PE-track intro",
  physical_letter: "Physical letter",
  monitor: "Monitor",
  skip: "Skip",
};

function ActionPill({ action }: { action: RecommendedAction }) {
  return (
    <span
      className={`inline-block text-xs px-2 py-0.5 rounded font-semibold ${ACTION_STYLES[action]}`}
    >
      {ACTION_LABELS[action]}
    </span>
  );
}

function ScoreBadge({ value, label }: { value: number; label: string }) {
  const tone =
    value >= 70
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100"
      : value >= 50
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100"
        : value >= 30
          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${tone}`} title={label}>
      {label}: {value}
    </span>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export default function CommandCenterPage() {
  const [data, setData] = useState<CommandCenterPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"overall" | "pe" | "recent">("overall");
  const [filter, setFilter] = useState<RecommendedAction | "all">("all");
  const [view, setView] = useState<"companies" | "jobs">("companies");
  const [rescoring, setRescoring] = useState(false);
  const [rescoreMessage, setRescoreMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/jobs/command-center?sort=${sort}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((json: CommandCenterPayload) => {
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [sort]);

  const filteredJobs = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.jobs;
    return data.jobs.filter((j) => j.fit?.recommended_action === filter);
  }, [data, filter]);

  const filteredCompanies = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.companies;
    return data.companies.filter((c) => c.best_recommended_action === filter);
  }, [data, filter]);

  async function handleRescoreAll() {
    setRescoring(true);
    setRescoreMessage(null);
    try {
      const res = await fetch("/api/jobs/rescore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all_relevant: true, limit: 500 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `status ${res.status}`);
      setRescoreMessage(
        `scored ${json.scored ?? 0} · persisted ${json.persisted ?? 0}${
          json.warnings && json.warnings.length > 0 ? ` · warnings ${json.warnings.length}` : ""
        }`
      );
      // Refresh the page data.
      setSort((prev) => prev);
      const refresh = await fetch(`/api/jobs/command-center?sort=${sort}`, { cache: "no-store" });
      if (refresh.ok) setData(await refresh.json());
    } catch (err) {
      setRescoreMessage(`error: ${(err as Error).message}`);
    } finally {
      setRescoring(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Command center</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Today&apos;s relevant roles, ranked by Kohler fit, with contact and outreach status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={handleRescoreAll}
            disabled={rescoring}
            className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm font-medium disabled:opacity-50 hover:bg-gray-800"
          >
            {rescoring ? "Rescoring…" : "Rescore all"}
          </button>
          {rescoreMessage && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{rescoreMessage}</span>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-red-800 text-sm">
          {error}
        </div>
      )}

      {data && (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Open roles" value={data.counts.total_jobs} />
            <Stat label="Open-role companies" value={data.counts.total_companies} />
            <Stat label="PE-track signals" value={data.counts.jobs_pe_signal} />
            <Stat
              label="Persisted fit scores"
              value={`${data.counts.jobs_with_persisted_fit} / ${data.counts.total_jobs}`}
            />
          </section>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="flex rounded border overflow-hidden">
              <button
                onClick={() => setView("companies")}
                className={`px-3 py-1.5 ${view === "companies" ? "bg-gray-900 text-white" : "bg-white dark:bg-gray-900"}`}
              >
                Companies
              </button>
              <button
                onClick={() => setView("jobs")}
                className={`px-3 py-1.5 ${view === "jobs" ? "bg-gray-900 text-white" : "bg-white dark:bg-gray-900"}`}
              >
                Jobs
              </button>
            </div>

            <div className="flex rounded border overflow-hidden">
              {(["overall", "pe", "recent"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`px-3 py-1.5 ${sort === s ? "bg-gray-900 text-white" : "bg-white dark:bg-gray-900"}`}
                >
                  Sort: {s}
                </button>
              ))}
            </div>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as RecommendedAction | "all")}
              className="rounded border px-2 py-1.5 bg-white dark:bg-gray-900"
            >
              <option value="all">All actions</option>
              {(Object.keys(ACTION_LABELS) as RecommendedAction[]).map((k) => (
                <option key={k} value={k}>
                  {ACTION_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          {view === "companies" && (
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCompanies.map((c) => (
                <article
                  key={c.companyname}
                  className="border rounded p-3 bg-white dark:bg-gray-900 dark:border-gray-700"
                >
                  <header className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h2 className="font-semibold leading-tight">{c.companyname}</h2>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {[c.city, c.niche].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <ActionPill action={c.best_recommended_action} />
                  </header>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <ScoreBadge label="overall" value={c.best_overall_score} />
                    <ScoreBadge label="PE" value={c.best_pe_score} />
                  </div>
                  <div className="text-xs text-gray-700 dark:text-gray-300">
                    {c.total_open_roles} open role{c.total_open_roles === 1 ? "" : "s"}
                    {" · "}
                    {c.sources.length} source{c.sources.length === 1 ? "" : "s"}
                  </div>
                  <div className="text-xs text-gray-700 dark:text-gray-300 mt-1">
                    Best: {c.best_role_title}
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs mt-2">
                    <div className="text-gray-500">contacts</div>
                    <div>
                      {c.contacts.count} ({c.contacts.emailCount} email)
                    </div>
                    <div className="text-gray-500">outreach</div>
                    <div>
                      d {c.outreach.draftCount} · p {c.outreach.printedCount} · s {c.outreach.sentCount}
                    </div>
                    <div className="text-gray-500">last seen</div>
                    <div>{formatTimestamp(c.last_seen_at)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    <a
                      href={`/company/${encodeURIComponent(c.companyname)}`}
                      className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200"
                    >
                      View company
                    </a>
                    {c.careers_url && (
                      <a
                        href={c.careers_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200"
                      >
                        Careers ↗
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}

          {view === "jobs" && (
            <section className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="px-2 py-1">Action</th>
                    <th className="px-2 py-1">Title</th>
                    <th className="px-2 py-1">Company</th>
                    <th className="px-2 py-1">Location</th>
                    <th className="px-2 py-1">Source</th>
                    <th className="px-2 py-1">Overall</th>
                    <th className="px-2 py-1">PE</th>
                    <th className="px-2 py-1">Last seen</th>
                    <th className="px-2 py-1">Why</th>
                    <th className="px-2 py-1">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((row) => {
                    const fit = row.fit;
                    const action = (fit?.recommended_action ?? "monitor") as RecommendedAction;
                    return (
                      <tr key={row.job.id} className="border-b align-top">
                        <td className="px-2 py-1">
                          <ActionPill action={action} />
                          {fit?.fallback && (
                            <div className="text-[10px] text-amber-600 mt-0.5">inline</div>
                          )}
                        </td>
                        <td className="px-2 py-1 font-medium">{row.job.title}</td>
                        <td className="px-2 py-1">
                          <a
                            href={`/company/${encodeURIComponent(row.job.companyname)}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {row.job.companyname}
                          </a>
                        </td>
                        <td className="px-2 py-1 text-gray-600 dark:text-gray-300">
                          {row.job.location ?? "—"}
                        </td>
                        <td className="px-2 py-1 text-gray-600 dark:text-gray-300">
                          {row.job.source ?? "—"}
                        </td>
                        <td className="px-2 py-1">{fit?.overall_score ?? "—"}</td>
                        <td className="px-2 py-1">{fit?.pe_track_score ?? "—"}</td>
                        <td className="px-2 py-1 text-gray-600 dark:text-gray-300">
                          {formatTimestamp(row.job.last_seen_at)}
                        </td>
                        <td className="px-2 py-1 text-xs text-gray-700 dark:text-gray-300 max-w-xs">
                          {fit?.explanation_json?.notes && fit.explanation_json.notes.length > 0
                            ? fit.explanation_json.notes.join("; ")
                            : (fit?.explanation_json?.matched_skills ?? []).slice(0, 3).join(", ") ||
                              "—"}
                        </td>
                        <td className="px-2 py-1">
                          {row.job.apply_url || row.job.job_url || row.job.source_url ? (
                            <a
                              className="text-blue-600 hover:underline"
                              href={row.job.apply_url || row.job.job_url || row.job.source_url || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              ↗
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border p-3 bg-white dark:bg-gray-900 dark:border-gray-700">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
