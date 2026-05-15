"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
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
  letterOptions: LetterOption[];
  bouncedContacts: BouncedContact[];
  counts: {
    sent: number;
    threads: number;
    messages: number;
    actionable: number;
    bounces: number;
    byClassification: Record<string, number>;
  };
}

interface BouncedContact {
  email: string;
  companyname: string | null;
  contactName: string | null;
  receivedAt: string | null;
  reason: string | null;
  replacementContacts?: ReplacementContact[];
}

interface ReplacementContact {
  contactname: string | null;
  title: string | null;
  email: string | null;
}

interface LetterOption {
  id: string;
  companyname: string | null;
  contact_email: string | null;
  subject: string | null;
  sent_at: string | null;
  metadata?: {
    contactname?: string | null;
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
  const [saving, setSaving] = useState(false);
  const [manual, setManual] = useState({
    sentMessageId: "",
    classification: "positive_reply",
    receivedAt: new Date().toISOString().slice(0, 16),
    fromEmail: "",
    contactName: "",
    subject: "",
    snippet: "",
  });

  async function loadReplies() {
    setLoading(true);
    return fetch("/api/replies")
      .then((res) => res.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setData(body);
      })
      .catch((error) => toast(error.message, "error"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadReplies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const counts = data?.counts;
  const selectedLetter = data?.letterOptions.find((option) => option.id === manual.sentMessageId);

  async function saveManualReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manual.sentMessageId) {
      toast("Choose the letter this reply belongs to.", "error");
      return;
    }
    if (!manual.snippet.trim()) {
      toast("Add a short note or paste the reply text.", "error");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/replies/manual-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...manual,
          contactEmail: selectedLetter?.contact_email || null,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error || "Could not save letter reply.");
      toast("Letter reply added.");
      setManual({
        sentMessageId: "",
        classification: "positive_reply",
        receivedAt: new Date().toISOString().slice(0, 16),
        fromEmail: "",
        contactName: "",
        subject: "",
        snippet: "",
      });
      await loadReplies();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save letter reply.", "error");
    } finally {
      setSaving(false);
    }
  }

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

          {(data?.bouncedContacts.length || 0) > 0 && (
            <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-4 shadow-sm">
              <div className="mb-3 flex flex-col gap-1">
                <h2 className="text-sm font-bold text-red-950">Suppressed Bounced Emails</h2>
                <p className="text-xs text-red-800">
                  These addresses had delivery failures and are blocked from future live sends until replaced or verified.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {data?.bouncedContacts.map((contact) => (
                  <div key={contact.email} className="rounded-xl border border-red-100 bg-white px-3 py-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-all text-sm font-bold text-slate-900">{contact.email}</p>
                        <p className="text-xs text-slate-600">
                          {contact.companyname || "Unknown company"}
                          {contact.contactName ? ` · ${contact.contactName}` : ""}
                        </p>
                      </div>
                      {contact.companyname && (
                        <Link
                          href={`/company/${encodeURIComponent(contact.companyname)}`}
                          className="shrink-0 rounded-lg border border-red-100 px-2 py-1 text-xs font-bold text-red-800 hover:bg-red-50"
                        >
                          Review company
                        </Link>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-red-700">{contact.reason || "Delivery failure"}</p>
                    {(contact.replacementContacts?.length || 0) > 0 ? (
                      <div className="mt-2 space-y-1 border-t border-red-50 pt-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Replacement candidates
                        </p>
                        {contact.replacementContacts?.map((replacement) => (
                          <p key={`${contact.email}-${replacement.email}`} className="text-xs text-slate-700">
                            <span className="font-semibold text-slate-900">{replacement.contactname || "Unnamed contact"}</span>
                            {replacement.title ? ` · ${replacement.title}` : ""}
                            {replacement.email ? ` · ${replacement.email}` : ""}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 border-t border-red-50 pt-2 text-xs text-slate-500">
                        No alternate email is currently stored for this company.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={saveManualReply} className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-1">
              <h2 className="text-sm font-bold text-slate-900">Add Letter Reply</h2>
              <p className="text-xs text-slate-500">
                Use this when Kohler receives a response to a physical letter outside a readable mailbox.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Letter
                <select
                  value={manual.sentMessageId}
                  onChange={(event) => setManual((current) => ({ ...current, sentMessageId: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">Choose sent letter...</option>
                  {data?.letterOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.companyname || "Unknown company"} · {dateLabel(option.sent_at)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Reply Type
                <select
                  value={manual.classification}
                  onChange={(event) => setManual((current) => ({ ...current, classification: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="positive_reply">Positive reply</option>
                  <option value="recruiter_screen">Recruiter screen</option>
                  <option value="referral">Referral</option>
                  <option value="needs_follow_up">Needs follow-up</option>
                  <option value="apply_online">Apply online</option>
                  <option value="rejection">Rejection</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>

              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Received
                <input
                  type="datetime-local"
                  value={manual.receivedAt}
                  onChange={(event) => setManual((current) => ({ ...current, receivedAt: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </label>

              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                From Email
                <input
                  type="email"
                  value={manual.fromEmail}
                  onChange={(event) => setManual((current) => ({ ...current, fromEmail: event.target.value }))}
                  placeholder={selectedLetter?.contact_email || "optional"}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </label>

              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
                Subject
                <input
                  value={manual.subject}
                  onChange={(event) => setManual((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="optional"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </label>

              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
                Reply Notes
                <textarea
                  value={manual.snippet}
                  onChange={(event) => setManual((current) => ({ ...current, snippet: event.target.value }))}
                  rows={4}
                  placeholder="Paste the reply or summarize what Kohler received."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Saved replies count as letter responses in analytics and remain marked as manual entries.
              </p>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Add reply"}
              </button>
            </div>
          </form>

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
