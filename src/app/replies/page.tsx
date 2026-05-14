"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

interface ReplyMessage {
  id: string;
  from_email: string | null;
  subject: string | null;
  snippet: string | null;
  received_at: string | null;
  classification: string;
  metadata?: {
    companyname?: string | null;
    contact_email?: string | null;
    matched_by?: string | null;
    channel?: string | null;
  };
}

interface ReplyResponse {
  messages: ReplyMessage[];
  counts: {
    sent: number;
    threads: number;
    messages: number;
    actionable: number;
    bounces: number;
    byClassification: Record<string, number>;
  };
}

const CLASS_COLORS: Record<string, string> = {
  positive_reply: "bg-emerald-100 text-emerald-800",
  recruiter_screen: "bg-emerald-100 text-emerald-800",
  referral: "bg-blue-100 text-blue-800",
  needs_follow_up: "bg-amber-100 text-amber-800",
  apply_online: "bg-indigo-100 text-indigo-800",
  rejection: "bg-rose-100 text-rose-800",
  bounce: "bg-red-100 text-red-800",
  out_of_office: "bg-slate-100 text-slate-700",
  auto_reply: "bg-slate-100 text-slate-700",
  unknown: "bg-gray-100 text-gray-700",
};

function label(value: string) {
  return value.replace(/_/g, " ");
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown date";
}

export default function RepliesPage() {
  const toast = useToast();
  const [data, setData] = useState<ReplyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/replies")
      .then((res) => res.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setData(body);
      })
      .catch((error) => toast(error.message, "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  const counts = data?.counts;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 rounded-2xl bg-slate-900 px-5 py-5 text-white shadow-xl">
        <h1 className="text-2xl font-bold">Replies</h1>
        <p className="mt-1 text-sm text-slate-300">
          Gmail replies and bounces matched back to outbound emails and letters.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading replies...</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Metric label="Outbound" value={counts?.sent || 0} />
            <Metric label="Threads" value={counts?.threads || 0} />
            <Metric label="Messages" value={counts?.messages || 0} />
            <Metric label="Actionable" value={counts?.actionable || 0} />
            <Metric label="Bounces" value={counts?.bounces || 0} />
          </div>

          {(data?.messages.length || 0) === 0 ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              No replies are imported yet. The 33 outbound records are synced separately; Gmail backfill still needs a valid Kohler mailbox OAuth connection before this table fills with real replies.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {data?.messages.map((message) => (
                <div key={message.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{message.subject || "(no subject)"}</p>
                      <p className="text-xs text-slate-500">
                        {message.metadata?.companyname || message.from_email || "Unknown sender"} · {dateLabel(message.received_at)}
                      </p>
                    </div>
                    <span className={`w-fit rounded-full px-2 py-1 text-[11px] font-bold ${CLASS_COLORS[message.classification] || CLASS_COLORS.unknown}`}>
                      {label(message.classification)}
                    </span>
                  </div>
                  {message.snippet && <p className="mt-2 text-sm text-slate-600">{message.snippet}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
