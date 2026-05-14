"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

interface AnalyticsResponse {
  cards: {
    outboundSynced: number;
    outreachRowsWithOutboundDates: number;
    emailSent: number;
    lettersSent: number;
    repliesReceived: number;
    actionableReplies: number;
    positiveReplies: number;
    bounces: number;
    threads: number;
    responseRate: number;
    positiveResponseRate: number;
    bounceRate: number;
  };
  byChannel: Record<string, number>;
  byClassification: Record<string, number>;
  latestReplies: Array<{ id: string; classification: string; received_at: string | null; metadata?: { companyname?: string | null } }>;
  latestOutbound: Array<{ id: string; channel: string; companyname: string | null; sent_at: string | null; status: string | null }>;
}

function label(value: string) {
  return value.replace(/_/g, " ");
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Unknown";
}

export default function AnalyticsPage() {
  const toast = useToast();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((res) => res.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setData(body);
      })
      .catch((error) => toast(error.message, "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  const cards = data?.cards;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 rounded-2xl bg-slate-900 px-5 py-5 text-white shadow-xl">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-slate-300">
          Outreach performance from sent emails, physical letters, Gmail replies, and bounces.
        </p>
      </div>

      {loading || !cards ? (
        <p className="text-sm text-slate-500">Loading analytics...</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Outbound synced" value={cards.outboundSynced} sub={`${cards.emailSent} email · ${cards.lettersSent} letters`} />
            <Metric label="Replies" value={cards.repliesReceived} sub={`${cards.actionableReplies} actionable`} />
            <Metric label="Positive" value={cards.positiveReplies} sub={`${cards.positiveResponseRate}% positive rate`} />
            <Metric label="Bounces" value={cards.bounces} sub={`${cards.bounceRate}% bounce rate`} />
            <Metric label="Response rate" value={`${cards.responseRate}%`} sub={`${cards.threads} matched threads`} />
            <Metric label="Raw outreach rows" value={cards.outreachRowsWithOutboundDates} sub="includes draft/timestamp anomalies" />
            <Metric label="Email sent" value={cards.emailSent} sub="from emailed_at" />
            <Metric label="Letters sent" value={cards.lettersSent} sub="printed/sent letters" />
          </div>

          {cards.repliesReceived === 0 && (
            <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              Outbound records are synced, but no matching Gmail replies are imported yet. The current readable Gmail connection is not Kohler's `kwood12802@gmail.com` or `akwood1@mines.edu`; reconnect those mailboxes to populate reply and bounce metrics.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Breakdown title="By Channel" rows={data.byChannel} />
            <Breakdown title="By Reply Type" rows={data.byClassification} empty="No reply classifications yet" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <List title="Latest Outbound">
              {data.latestOutbound.length === 0 ? (
                <p className="text-sm text-slate-500">No outbound records synced.</p>
              ) : (
                data.latestOutbound.map((row) => (
                  <div key={row.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-b-0">
                    <div>
                      <p className="font-medium text-slate-900">{row.companyname || "Unknown company"}</p>
                      <p className="text-xs text-slate-500">{dateLabel(row.sent_at)} · {row.status || "unknown"}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700">{row.channel}</span>
                  </div>
                ))
              )}
            </List>

            <List title="Latest Replies">
              {data.latestReplies.length === 0 ? (
                <p className="text-sm text-slate-500">No replies imported yet.</p>
              ) : (
                data.latestReplies.map((row) => (
                  <div key={row.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-b-0">
                    <div>
                      <p className="font-medium text-slate-900">{row.metadata?.companyname || "Unknown company"}</p>
                      <p className="text-xs text-slate-500">{dateLabel(row.received_at)}</p>
                    </div>
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-bold text-blue-700">{label(row.classification)}</span>
                  </div>
                ))
              )}
            </List>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function Breakdown({ title, rows, empty }: { title: string; rows: Record<string, number>; empty?: string }) {
  const entries = Object.entries(rows);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty || "No data yet"}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{label(key)}</span>
              <span className="font-bold text-slate-900">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function List({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <h2 className="mb-2 text-sm font-bold text-slate-900">{title}</h2>
      {children}
    </div>
  );
}
