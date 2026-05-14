"use client";

import { useEffect, useState } from "react";

interface Funnel {
  drafts: number;
  letters_sent: number;
  emails_sent: number;
  total_sent: number;
  inbound_total: number;
  inbound_positive: number;
}

interface ChannelStats {
  sent_with_email: number;
  replied: number;
  positive: number;
  response_rate: number;
  positive_response_rate: number;
}

interface RollupBucket {
  bucket: string;
  sent: number;
  replied: number;
  positive: number;
  response_rate: number;
  positive_response_rate: number;
}

interface CrossRow {
  id: string;
  companyname: string;
  tier: number | null;
  niche: string | null;
  contactname: string | null;
  contact_email: string | null;
  job_title: string | null;
  job_url: string | null;
  channel: "email" | "letter" | "draft";
  sent_at: string | null;
  direct_reply_count: number;
  domain_reply_count: number;
  best_classification: string | null;
  latest_reply_at: string | null;
}

interface AnalyticsPayload {
  ok: boolean;
  note: string | null;
  funnel: Funnel;
  channels: { email: ChannelStats; letter: ChannelStats };
  classification_breakdown: Record<string, number>;
  rollup_by_tier: RollupBucket[];
  rollup_by_niche: RollupBucket[];
  rows: CrossRow[];
}

const CHANNEL_STYLES: Record<string, string> = {
  email: "bg-blue-600 text-white",
  letter: "bg-amber-600 text-white",
  draft: "bg-zinc-400 text-white",
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOnlySent, setShowOnlySent] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/outreach-overview", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: AnalyticsPayload) => setData(json))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-red-800 text-sm">
        {error}
      </div>
    );
  }

  if (!data) return <div className="text-sm text-gray-500">Loading…</div>;

  const visibleRows = showOnlySent ? data.rows.filter((r) => r.channel !== "draft") : data.rows;
  const totalReplies = Object.values(data.classification_breakdown).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Outreach analytics</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Cross-references every outbound (letter or email) against Gmail replies. Lights up automatically as the daily Gmail sync populates email_messages.
        </p>
      </header>

      {data.note && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
          {data.note}
        </div>
      )}

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Drafts (not sent)" value={data.funnel.drafts} muted />
        <Stat label="Letters sent" value={data.funnel.letters_sent} />
        <Stat label="Emails sent" value={data.funnel.emails_sent} />
        <Stat label="Replies received" value={data.funnel.inbound_total} />
        <Stat label="Positive replies" value={data.funnel.inbound_positive} highlight />
        <Stat
          label="Overall response rate"
          value={pct(
            data.funnel.total_sent > 0 ? data.funnel.inbound_total / data.funnel.total_sent : 0
          )}
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ChannelCard title="Email channel" stats={data.channels.email} />
        <ChannelCard title="Letter channel" stats={data.channels.letter} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <RollupCard title="Response rate by tier" rows={data.rollup_by_tier} keyLabel="Tier" />
        <RollupCard title="Response rate by niche" rows={data.rollup_by_niche} keyLabel="Niche" />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Inbound classifications ({totalReplies})</h2>
        {totalReplies === 0 ? (
          <div className="text-sm text-gray-500">
            No replies imported yet. Daily Gmail sync runs at 8am MST in production.
          </div>
        ) : (
          <table className="text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-2 py-1">Class</th>
                <th className="px-2 py-1">Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.classification_breakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([cls, n]) => (
                  <tr key={cls} className="border-t">
                    <td className="px-2 py-1 font-mono">{cls}</td>
                    <td className="px-2 py-1">{n}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Per-outbound cross-reference</h2>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOnlySent}
              onChange={(e) => setShowOnlySent(e.target.checked)}
            />
            Hide drafts
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="px-2 py-1">Channel</th>
                <th className="px-2 py-1">Sent</th>
                <th className="px-2 py-1">Company</th>
                <th className="px-2 py-1">Tier</th>
                <th className="px-2 py-1">Contact</th>
                <th className="px-2 py-1">Role</th>
                <th className="px-2 py-1">Reply</th>
                <th className="px-2 py-1">Latest reply</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.id} className="border-b align-top">
                  <td className="px-2 py-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-semibold ${CHANNEL_STYLES[r.channel]}`}
                    >
                      {r.channel}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-gray-600 dark:text-gray-300">
                    {formatDate(r.sent_at)}
                  </td>
                  <td className="px-2 py-1 font-medium">
                    <a
                      href={`/company/${encodeURIComponent(r.companyname)}`}
                      className="hover:underline"
                    >
                      {r.companyname}
                    </a>
                  </td>
                  <td className="px-2 py-1">{r.tier ?? "—"}</td>
                  <td className="px-2 py-1 text-gray-700 dark:text-gray-300">
                    {r.contactname ?? "—"}
                    {r.contact_email && (
                      <div className="text-xs text-gray-500 truncate max-w-xs">{r.contact_email}</div>
                    )}
                  </td>
                  <td className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 max-w-xs">
                    {r.job_title ?? "—"}
                  </td>
                  <td className="px-2 py-1">
                    {r.direct_reply_count > 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        {r.direct_reply_count} direct
                      </span>
                    ) : r.domain_reply_count > 0 ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        {r.domain_reply_count} domain
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                    {r.best_classification && (
                      <div className="text-xs text-gray-500">{r.best_classification}</div>
                    )}
                  </td>
                  <td className="px-2 py-1 text-xs text-gray-500">{formatDate(r.latest_reply_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && (
            <div className="py-6 text-center text-sm text-gray-500">No outbound rows yet.</div>
          )}
        </div>
      </section>

      <footer className="text-xs text-gray-500 dark:text-gray-400 border-t pt-3">
        <p>
          <strong>Cross-reference logic:</strong> &ldquo;direct&rdquo; = inbound from_email exactly matches outbound contact_email and arrived after the send timestamp. &ldquo;domain&rdquo; = different person from the same email domain. Letters use the same logic against the listed contact_email when present.
        </p>
        <p className="mt-1">
          With current send volume (33 total), response-rate numbers are directional, not statistical. Confidence improves as volume grows.
        </p>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  muted,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  muted?: boolean;
}) {
  const tone = highlight
    ? "border-emerald-400"
    : muted
      ? "border-gray-200 dark:border-gray-700 opacity-70"
      : "border-gray-200 dark:border-gray-700";
  return (
    <div className={`rounded border ${tone} p-3 bg-white dark:bg-gray-900`}>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function ChannelCard({ title, stats }: { title: string; stats: ChannelStats }) {
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900 space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="text-gray-500 dark:text-gray-400">Sent (with contact email)</div>
        <div className="font-mono">{stats.sent_with_email}</div>
        <div className="text-gray-500 dark:text-gray-400">Replied</div>
        <div className="font-mono">{stats.replied}</div>
        <div className="text-gray-500 dark:text-gray-400">Positive</div>
        <div className="font-mono">{stats.positive}</div>
        <div className="text-gray-500 dark:text-gray-400">Response rate</div>
        <div className="font-mono">{pct(stats.response_rate)}</div>
        <div className="text-gray-500 dark:text-gray-400">Positive rate</div>
        <div className="font-mono">{pct(stats.positive_response_rate)}</div>
      </div>
    </div>
  );
}

function RollupCard({
  title,
  rows,
  keyLabel,
}: {
  title: string;
  rows: RollupBucket[];
  keyLabel: string;
}) {
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
      <h3 className="font-semibold mb-2">{title}</h3>
      {rows.length === 0 ? (
        <div className="text-sm text-gray-500">No sent outbound rows to rollup yet.</div>
      ) : (
        <table className="text-sm w-full">
          <thead>
            <tr className="text-left">
              <th className="px-2 py-1">{keyLabel}</th>
              <th className="px-2 py-1">Sent</th>
              <th className="px-2 py-1">Replied</th>
              <th className="px-2 py-1">+%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bucket} className="border-t">
                <td className="px-2 py-1">{r.bucket}</td>
                <td className="px-2 py-1">{r.sent}</td>
                <td className="px-2 py-1">{r.replied}</td>
                <td className="px-2 py-1">{pct(r.positive_response_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
