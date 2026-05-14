"use client";

import { useEffect, useMemo, useState } from "react";

type Classification =
  | "positive_reply"
  | "recruiter_screen"
  | "apply_online"
  | "referral"
  | "needs_follow_up"
  | "rejection"
  | "bounce"
  | "out_of_office"
  | "auto_reply"
  | "unknown";

interface ReplyMessage {
  id: string;
  email_thread_id: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  direction: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  classification: Classification | null;
  classification_confidence: number | null;
  internal_date: string | null;
  thread: {
    companyname: string | null;
    needs_action: boolean;
    contact_email: string | null;
    last_classification: string | null;
  } | null;
}

interface RepliesPayload {
  ok: boolean;
  count: number;
  messages: ReplyMessage[];
  breakdown: Record<string, number>;
  warning?: string;
}

const CLASSIFICATION_STYLES: Record<string, { tone: string; label: string }> = {
  positive_reply: { tone: "bg-emerald-600 text-white", label: "Positive" },
  recruiter_screen: { tone: "bg-blue-600 text-white", label: "Recruiter screen" },
  apply_online: { tone: "bg-sky-500 text-white", label: "Apply online" },
  referral: { tone: "bg-violet-600 text-white", label: "Referral" },
  needs_follow_up: { tone: "bg-amber-500 text-white", label: "Follow-up due" },
  rejection: { tone: "bg-rose-600 text-white", label: "Rejection" },
  bounce: { tone: "bg-zinc-700 text-white", label: "Bounce" },
  out_of_office: { tone: "bg-slate-500 text-white", label: "OOO" },
  auto_reply: { tone: "bg-slate-500 text-white", label: "Auto-reply" },
  unknown: { tone: "bg-zinc-400 text-white", label: "Unknown" },
};

const CATEGORY_ORDER: Array<Classification | "all" | "needs_action"> = [
  "all",
  "needs_action",
  "positive_reply",
  "recruiter_screen",
  "needs_follow_up",
  "referral",
  "apply_online",
  "rejection",
  "out_of_office",
  "auto_reply",
  "bounce",
  "unknown",
];

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    const now = new Date();
    const ms = now.getTime() - d.getTime();
    const days = Math.floor(ms / 86400000);
    if (days === 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  } catch {
    return value;
  }
}

export default function RepliesPage() {
  const [data, setData] = useState<RepliesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Classification | "all" | "needs_action">("needs_action");
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  function load() {
    setError(null);
    const params = new URLSearchParams();
    if (filter !== "all" && filter !== "needs_action") params.set("classification", filter);
    if (filter === "needs_action") params.set("needs_action_only", "true");
    fetch(`/api/replies/list?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: RepliesPayload) => setData(json))
      .catch((e: Error) => setError(e.message));
  }

  useEffect(load, [filter]);

  async function handleSyncNow() {
    setRunning(true);
    setRunMessage(null);
    try {
      const res = await fetch("/api/gmail/sync-incremental", { method: "POST" });
      const json = await res.json();
      if (!res.ok && json.error) {
        setRunMessage(`error: ${json.error}`);
      } else {
        setRunMessage(
          `synced — fetched ${json.fetched ?? "?"}, inserted ${json.inserted_messages ?? 0} messages, ${json.inserted_threads ?? 0} threads`
        );
        load();
      }
    } catch (e) {
      setRunMessage(`error: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  const breakdown = data?.breakdown ?? {};
  const totalAll = useMemo(
    () => Object.values(breakdown).reduce((a, b) => a + b, 0),
    [breakdown]
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbound replies</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Classified replies from Kohler&apos;s Gmail. Auto-syncs daily; click &ldquo;Sync now&rdquo; for an immediate refresh.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncNow}
            disabled={running}
            className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm font-medium disabled:opacity-50 hover:bg-gray-800"
          >
            {running ? "Syncing…" : "Sync now"}
          </button>
          {runMessage && (
            <span className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">{runMessage}</span>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-red-800 text-sm">
          {error}
        </div>
      )}

      {data?.warning && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
          {data.warning}
        </div>
      )}

      <div className="flex flex-wrap gap-1 text-xs">
        {CATEGORY_ORDER.map((cat) => {
          const isActive = filter === cat;
          const count =
            cat === "all"
              ? totalAll
              : cat === "needs_action"
                ? (breakdown.positive_reply ?? 0) +
                  (breakdown.recruiter_screen ?? 0) +
                  (breakdown.needs_follow_up ?? 0) +
                  (breakdown.referral ?? 0)
                : breakdown[cat] ?? 0;
          const label =
            cat === "all"
              ? "All"
              : cat === "needs_action"
                ? "Needs action"
                : CLASSIFICATION_STYLES[cat]?.label ?? cat;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-2.5 py-1 rounded border ${isActive ? "bg-gray-900 text-white border-gray-900" : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"}`}
            >
              {label} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {data && data.messages.length === 0 ? (
        <div className="rounded border border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500">
          No replies in this category yet.
          {totalAll === 0 && " Click “Sync now” to pull from Gmail."}
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {data?.messages.map((m) => {
            const cls = (m.classification ?? "unknown") as Classification;
            const style = CLASSIFICATION_STYLES[cls] ?? CLASSIFICATION_STYLES.unknown;
            return (
              <li key={m.id} className="py-3 flex flex-col sm:flex-row sm:gap-4">
                <div className="flex-shrink-0 w-32 text-xs text-gray-500 dark:text-gray-400">
                  {formatTimestamp(m.internal_date)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${style.tone}`}>
                      {style.label}
                    </span>
                    {m.thread?.needs_action && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                        action needed
                      </span>
                    )}
                    {m.thread?.companyname && (
                      <span className="text-xs text-gray-700 dark:text-gray-300">
                        {m.thread.companyname}
                      </span>
                    )}
                  </div>
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                    {m.subject ?? "(no subject)"}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email ?? ""}
                  </div>
                  {m.snippet && (
                    <div className="text-xs text-gray-700 dark:text-gray-300 mt-1 line-clamp-2">
                      {m.snippet}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 text-xs">
                  {m.gmail_thread_id && (
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${m.gmail_thread_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Open in Gmail ↗
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
